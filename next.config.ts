import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// ── CDN ────────────────────────────────────────────────────────────────
// On Vercel the whole site (static files, images, ISR pages) is already
// served from its global edge network — you do NOT need to set anything.
// Only set CDN_URL (e.g. https://cdn.example.com) if you put your own
// pull-through CDN (Cloudflare, Bunny, CloudFront…) in front of the app:
// build assets under /_next/static/* are then requested from that host.
// Fonts are fetched cross-origin in that setup, so the CDN origin is also
// added to the CSP below and /_next/static/* gets a CORS header.
const cdnUrl = process.env.CDN_URL?.replace(/\/$/, "");
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
const cdnSrc = cdnUrl ? ` ${cdnUrl}` : "";

// ── Remote images ──────────────────────────────────────────────────────
// next/image is an image *proxy*: whatever hosts are listed here, anyone on
// the internet can ask this server to fetch, resize and re-encode images
// from. The old `hostname: "**"` allowed every https host — an open image
// proxy that could be abused for bandwidth/CPU cost. Only the project's own
// Supabase Storage (public bucket) is needed.
function supabaseImagePatterns(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> {
  const pathname = "/storage/v1/object/public/**";
  try {
    if (process.env.SUPABASE_URL) {
      return [{ protocol: "https", hostname: new URL(process.env.SUPABASE_URL).hostname, pathname }];
    }
  } catch {
    // fall through to the wildcard
  }
  return [{ protocol: "https", hostname: "*.supabase.co", pathname }];
}

const supabaseOrigin = process.env.SUPABASE_URL || "https://*.supabase.co";

// ── Security headers (every route) ─────────────────────────────────────
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // No `preload`: that flag is a promise to browser vendors that EVERY
  // subdomain will be HTTPS-only forever, hard to undo. Add it only when you
  // deliberately submit the domain to hstspreload.org.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      // Showcase videos are uploaded to Supabase Storage, which is a
      // different origin from the app itself. Without media-src, CSP
      // falls back to default-src 'self' and silently blocks the <video>
      // tag from loading anything off-origin — the video looks "broken"
      // with no visible error.
      "media-src 'self' blob: https:",
      // 'unsafe-eval' is required in dev only — Next.js's hot-reload
      // (react-refresh) uses eval(), which CSP otherwise blocks. It's left
      // out in production so the built app keeps the stricter policy.
      // sdk.cashfree.com is the ONLY third-party script host allowed
      // (Cashfree's checkout SDK, loaded on demand — see
      // lib/loadCashfreeScript.ts).
      `script-src 'self'${cdnSrc} 'unsafe-inline' https://sdk.cashfree.com${!isProd ? " 'unsafe-eval'" : ""}`,
      `style-src 'self'${cdnSrc} 'unsafe-inline'`,
      `font-src 'self'${cdnSrc} data:`,
      // The admin panel uploads files straight from the browser to
      // Supabase Storage (bypassing this app's server, since Vercel caps
      // serverless request bodies at ~4.5MB) — that PUT goes to the
      // Supabase project's own origin, so it has to be allowed here. The
      // dev-only ws://localhost hosts are for Next.js hot-reload and IDE
      // tooling; they are left out of production entirely.
      `connect-src 'self' https://*.cashfree.com ${supabaseOrigin}${
        !isProd ? " ws://localhost:* ws://127.0.0.1:*" : ""
      }`,
      // Cashfree's checkout renders inside an iframe (its popup mode) for
      // UPI/card entry — without this, the modal opens but stays blank.
      // Sandbox and production pages live on different *.cashfree.com hosts.
      "frame-src 'self' https://*.cashfree.com",
      "frame-ancestors 'none'",
      // No <object>/<embed>/plugins, no <base> hijacking, and forms may only
      // post to this site (or Cashfree's redirect flow).
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.cashfree.com",
      ...(isProd ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
  },
];

// ── Caching ────────────────────────────────────────────────────────────
// /_next/static/* (hashed JS/CSS/fonts) is already `immutable, 1 year` — Next
// sets that itself. The files under /public have *stable* names, so they
// can't be marked immutable (a re-deploy that changes one must reach
// returning visitors): browsers keep them a day, the CDN keeps them until
// the next deploy purges it, and stale-while-revalidate hides any refresh.
const PUBLIC_ASSET_CACHE = "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800";

// Anything private (admin, a buyer's access page, admin APIs) must never be
// stored by a CDN or shared cache.
const NO_STORE = "private, no-store, max-age=0";

const nextConfig: NextConfig = {
  ...(cdnUrl ? { assetPrefix: cdnUrl } : {}),
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,

  // Import only the icons/charts actually used instead of pulling whole
  // barrel files into the bundle.
  experimental: {
    optimizePackageImports: ["react-icons/fa", "react-icons/fi", "react-icons/bs", "recharts"],
  },

  images: {
    // AVIF first (≈30–50% smaller than WebP), WebP as the fallback, original
    // format only for browsers that support neither. Negotiated per request
    // from the Accept header, so every <Image> on the site gets it for free.
    formats: ["image/avif", "image/webp"],
    // Optimised images are re-used from the cache for 30 days instead of
    // being re-generated every minute (the default).
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Fewer breakpoints → fewer distinct variants to generate and cache.
    deviceSizes: [360, 640, 828, 1080, 1280, 1920],
    imageSizes: [40, 56, 96, 176, 256, 384],
    remotePatterns: supabaseImagePatterns(),
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },

      // Static files in /public (covers, video poster, previews, …)
      {
        source: "/:dir(covers|book|videos|uploads)/:file*",
        headers: [{ key: "Cache-Control", value: PUBLIC_ASSET_CACHE }],
      },

      // Private surfaces — never cacheable.
      { source: "/admin", headers: [{ key: "Cache-Control", value: NO_STORE }] },
      { source: "/api/admin/:path*", headers: [{ key: "Cache-Control", value: NO_STORE }] },
      { source: "/access/:path*", headers: [{ key: "Cache-Control", value: NO_STORE }] },
      { source: "/payment/:path*", headers: [{ key: "Cache-Control", value: NO_STORE }] },
      { source: "/api/payment/:path*", headers: [{ key: "Cache-Control", value: NO_STORE }] },

      // Fonts/JS served from a separate CDN origin are cross-origin requests.
      ...(cdnUrl && siteUrl
        ? [
            {
              source: "/_next/static/:path*",
              headers: [{ key: "Access-Control-Allow-Origin", value: siteUrl }],
            },
          ]
        : []),
    ];
  },
};

export default nextConfig;
