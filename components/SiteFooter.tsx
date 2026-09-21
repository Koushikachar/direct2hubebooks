import Link from "next/link";
import { LEGAL_LINKS } from "@/lib/legal";

export default function SiteFooter({ name = "Direct2hub" }: { name?: string }) {
  return (
    <footer className="border-t border-black/5 px-4 py-8 text-center text-sm text-brick-700/80 dark:border-white/10 dark:text-cream/70">
      <nav aria-label="Legal and support" className="mb-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="underline-offset-4 transition hover:text-ember-600 hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
      <p>
        © {new Date().getFullYear()} {name}. All rights reserved.
      </p>
    </footer>
  );
}
