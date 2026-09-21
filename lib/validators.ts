// Server-side validators for values that end up in links, image tags,
// filenames or storage keys. The browser is attacker-controlled, so every one
// of these is enforced on the server — never only in a form.

// Strips ASCII control characters (incl. CR/LF, used for header/log injection)
// and collapses whitespace.
export function cleanSingleLine(value: string, maxLength: number): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** https:// only — blocks javascript:, data:, http:, file: and friends. */
export function isSafeHttpsUrl(value: string, maxLength = 500): boolean {
  if (value.length > maxLength) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** A same-site path such as /uploads/logo.png — not //evil.com, not ../ tricks. */
export function isSafeRelativePath(value: string, maxLength = 300): boolean {
  return (
    value.length <= maxLength &&
    /^\/[A-Za-z0-9._~\-\/]*$/.test(value) &&
    !value.startsWith("//") &&
    !value.includes("..")
  );
}

/**
 * Media (image/video) URLs an admin may save: a same-site path, or a URL on
 * this project's own Supabase Storage host. Anything else would either break
 * next/image (which only allows that host) or point visitors' browsers at a
 * third-party server.
 */
export function isAllowedMediaUrl(value: string): boolean {
  if (isSafeRelativePath(value)) return true;
  if (!isSafeHttpsUrl(value, 600)) return false;
  const supabase = process.env.SUPABASE_URL;
  if (!supabase) return false;
  try {
    return new URL(value).hostname === new URL(supabase).hostname;
  } catch {
    return false;
  }
}

/** A storage key created by /api/admin/upload/sign (no slashes, no traversal). */
export function isSafeStorageKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value) && !value.includes("..");
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Neutralises spreadsheet formula injection ("=HYPERLINK(...)", "+cmd|…"). */
export function csvSafe(value: unknown): string {
  const str = String(value ?? "");
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}
