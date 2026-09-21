// Tiny browser-side cookie helper for harmless, non-secret UI preferences
// (e.g. light/dark theme). The site deliberately never touches
// localStorage/sessionStorage — anything sensitive lives in an httpOnly
// cookie set by the server (admin session, review edit tokens, device
// claims), and anything purely cosmetic uses a plain first-party cookie
// like this one. Never put a token or credential in here: this cookie is
// readable by page JavaScript by design.

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSeconds = ONE_YEAR_SECONDS): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}
