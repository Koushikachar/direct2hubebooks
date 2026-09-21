// Small server-side helpers for reading cookies off a raw Request (route
// handlers). Kept in one place so every route parses the Cookie header the
// same, defensive way — a malformed percent-escape in a cookie must never be
// able to throw and turn a request into a 500.

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieHeader(req: Request): Array<[string, string]> {
  const header = req.headers.get("cookie") || "";
  const out: Array<[string, string]> = [];
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out.push([trimmed.slice(0, eq), safeDecode(trimmed.slice(eq + 1))]);
  }
  return out;
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const [key, value] of parseCookieHeader(req)) {
    if (key === name) return value;
  }
  return undefined;
}

/** All cookies whose name starts with `prefix`, keyed by the part after it. */
export function readCookiesWithPrefix(req: Request, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of parseCookieHeader(req)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  }
  return out;
}
