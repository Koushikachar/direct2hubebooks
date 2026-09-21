"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { whenIdle } from "@/lib/idle";

// Paths that shouldn't count toward "site visitors" — the admin panel
// itself, and API routes (which can't render this component anyway).
const EXCLUDED_PREFIXES = ["/admin"];

/** Mounted once in the root layout. Fires a single small beacon per page
 * load so the admin dashboard can show unique visitors — see
 * app/api/track-visit/route.ts for how "unique" is actually enforced
 * (server-side, by cookie + day, not by counting every page load).
 *
 * The beacon is deferred until the browser is idle: analytics is
 * first-party and tiny, but it still has no business competing with the
 * page's first paint, hydration, or a very early tap. */
export default function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))) return;
    return whenIdle(() => {
      fetch("/api/track-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      }).catch(() => {
        // Analytics must never surface an error to a real visitor.
      });
    });
  }, [pathname]);

  return null;
}
