// Runs `fn` once the browser is idle (or after `timeoutMs` at the latest), so
// non-essential work — analytics beacons, "recent purchase" pop-ups — never
// competes with the page's own first render, hydration, or an early click.
// Returns a cancel function. Falls back to setTimeout where
// requestIdleCallback doesn't exist (Safari).
export function whenIdle(fn: () => void, timeoutMs = 3000): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn, { timeout: timeoutMs });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, Math.min(timeoutMs, 1500));
  return () => window.clearTimeout(id);
}
