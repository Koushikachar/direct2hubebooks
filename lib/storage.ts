import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Server-only Supabase Storage client — uses Supabase's S3-compatible API
// (Project Settings -> Storage -> S3 Connection), not the supabase-js SDK,
// so uploads work the same "presigned PUT straight from the browser" way
// they did with R2. Never import this file from client components and
// never expose SUPABASE_S3_SECRET_ACCESS_KEY with a NEXT_PUBLIC_ prefix.
const projectUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const region = process.env.SUPABASE_S3_REGION;
const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;

let cached: S3Client | null = null;

export function getStorageClient(): S3Client {
  if (!projectUrl || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_S3_REGION, SUPABASE_S3_ACCESS_KEY_ID and SUPABASE_S3_SECRET_ACCESS_KEY must be set to upload files."
    );
  }
  if (!cached) {
    cached = new S3Client({
      // Supabase's S3 gateway only supports path-style requests
      // (endpoint/bucket/key), not virtual-hosted-style (bucket.endpoint).
      forcePathStyle: true,
      region,
      endpoint: `${projectUrl}/storage/v1/s3`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return cached;
}

// Logo, hero image, and the showcase video are meant to be viewed directly
// in the browser, so they live in a bucket created as *Public* in the
// Supabase dashboard (Storage -> New bucket -> toggle "Public bucket" on).
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "uploads";

// The paid ebook PDF lives in a *private* bucket (created with "Public
// bucket" left off) — nothing outside this server can read it directly.
// Every download goes through /api/download, which checks payment status
// and the 3-download limit before streaming the file back, instead of
// ever handing out a permanent public link.
export const SUPABASE_PDF_BUCKET = process.env.SUPABASE_PDF_BUCKET || "protected-files";

// Public URL for an object in a Supabase *Public* bucket. Supabase serves
// these at a fixed, predictable path, so there's nothing extra to
// configure (unlike R2, where the public URL was a separate r2.dev
// subdomain or custom domain you had to look up and set yourself).
export function publicUrlFor(key: string): string {
  if (!projectUrl) {
    throw new Error("SUPABASE_URL must be set to serve uploaded media.");
  }
  return `${projectUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${key}`;
}

const checkedBuckets = new Set<string>();

// Confirms the bucket exists (and that these credentials can see it)
// before we try to upload into it. Unlike R2, a Supabase bucket's
// Public/Private flag can only be set at creation time — there's no way
// to set it through the S3 API — so both buckets must be created once by
// hand in the dashboard (Storage -> New bucket) rather than auto-created
// here. SUPABASE_BUCKET should be Public; SUPABASE_PDF_BUCKET must be
// Private. Safe to call on every upload — it's a no-op after the first
// successful check.
export async function ensureBucket(bucketName: string): Promise<void> {
  if (checkedBuckets.has(bucketName)) return;

  const client = getStorageClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    checkedBuckets.add(bucketName);
  } catch (err) {
    const name = (err as { name?: string })?.name || "";
    if (name === "NotFound" || name === "NoSuchBucket") {
      throw new Error(
        `The "${bucketName}" bucket doesn't exist yet. Create it in the Supabase dashboard: Storage -> New bucket -> name it "${bucketName}" (set "Public bucket" on for the uploads bucket, off for the protected-files bucket).`
      );
    }
    throw new Error(`Could not check Supabase Storage bucket "${bucketName}": ${(err as Error).message}`);
  }
}

// Mints a one-time presigned URL the *browser* can PUT the file bytes to
// directly — no file bytes ever pass through our own Next.js route. This
// is what lets large videos (or even a 5MB image) upload at all on
// Vercel: serverless Functions there hard-cap request bodies at 4.5MB (a
// platform limit, not something app code can raise), so any route that
// receives the file itself will 413 well before hitting our own size
// checks. Routing the upload directly to Supabase Storage sidesteps that
// limit entirely; our route only ever sees the resulting key afterwards.
export async function createSignedUploadUrl(
  bucket: string,
  key: string,
  contentType: string
): Promise<{ uploadUrl: string; key: string }> {
  const client = getStorageClient();
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 }); // 5 minutes
  return { uploadUrl, key };
}

// Fetches a private object's bytes server-side (used for the protected PDF
// download route, which streams the file back through our own origin
// instead of ever handing out a permanent Supabase URL).
export async function downloadObject(bucket: string, key: string): Promise<Buffer> {
  // Keys are always the flat names created by the admin upload route. Refuse
  // anything that could address another object (path traversal, absolute
  // paths, nested folders) even if a bad value somehow reached the database.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(key) || key.includes("..")) {
    throw new Error("Refusing to read an invalid storage key.");
  }
  const client = getStorageClient();
  const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!Body) throw new Error("Empty object body.");
  const chunks: Uint8Array[] = [];
  // Body is a web/node ReadableStream depending on runtime; both support
  // async iteration in the Node.js runtime this route runs in.
  for await (const chunk of Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Older rows (from before this switch, or from an earlier Cloudflare R2
// setup) may have stored a full Supabase public/signed URL, or an R2
// public URL, for pdfUrl/media fields; new uploads store just the storage
// key. This accepts any of them so nothing breaks for a product row saved
// before this change.
export function resolveStorageKey(value: string, bucket: string): string {
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
  ];
  for (const m of markers) {
    const idx = value.indexOf(m);
    if (idx !== -1) {
      const rest = value.slice(idx + m.length);
      return decodeURIComponent(rest.split("?")[0]);
    }
  }
  // A full URL from this same Supabase project (this bucket's own base)
  // -> strip it to the key.
  try {
    if (projectUrl && value.startsWith(`${projectUrl}/`)) {
      const afterHost = value.slice(projectUrl.length + 1);
      const idx = afterHost.indexOf(`${bucket}/`);
      if (idx !== -1) {
        return decodeURIComponent(afterHost.slice(idx + bucket.length + 1).split("?")[0]);
      }
    }
  } catch {
    // fall through — value is likely already a bare key
  }
  return value;
}
