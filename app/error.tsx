"use client";
import { useEffect } from "react";

// Without this file, an error thrown anywhere during rendering/hydration
// has no recovery path — the page is left stuck on whatever HTML the
// server sent, with none of the client-side interactivity (nav highlight,
// menus, buttons) ever attaching. This gives people a working "Try again"
// instead, and logs the real error so it can be tracked down.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-bold text-brick-950">Something went wrong</h1>
      <p className="max-w-md text-brick-700/80">
        This page hit an unexpected error. Reloading usually fixes it.
      </p>
      <button
        onClick={reset}
        className="rounded-full bg-ember-600 px-6 py-3 font-semibold text-white transition hover:bg-ember-500"
      >
        Try again
      </button>
    </div>
  );
}
