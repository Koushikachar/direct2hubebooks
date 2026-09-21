import type { ReactNode } from "react";
import Nav from "@/components/Nav";
import SiteFooter from "@/components/SiteFooter";
import { getProduct } from "@/lib/product";
import { POLICIES_LAST_UPDATED } from "@/lib/legal";

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-bold text-brick-800 dark:text-cream">{title}</h2>
      <div className="space-y-2 text-brick-700/90 dark:text-cream/80">{children}</div>
    </section>
  );
}

// Shared shell for the Terms, Privacy and Refund pages.
export default async function PolicyPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const product = await getProduct();
  return (
    <div className="min-h-screen">
      <Nav logoUrl={product.logoUrl} name="Direct2hub" />
      <div className="hero-glow border-b border-black/5 py-10 text-center dark:border-white/10">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-brick-700/70 dark:text-cream/60">Last updated: {POLICIES_LAST_UPDATED}</p>
      </div>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <article className="card space-y-7 p-6 text-sm leading-relaxed sm:p-8">
          {intro && <p className="text-brick-700/90 dark:text-cream/80">{intro}</p>}
          {children}
          <p className="border-t border-black/5 pt-5 text-brick-700/80 dark:border-white/10 dark:text-cream/70">
            Questions? Reach us any time through our{" "}
            <a href="/contact" className="font-semibold text-ember-600 underline underline-offset-4">
              Contact page
            </a>
            {product.contactPhone ? <> or call {product.contactPhone}.</> : "."}
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
