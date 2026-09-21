import type { Metadata } from "next";
import { Sora, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import VisitorTracker from "@/components/VisitorTracker";
import { getSiteUrl } from "@/lib/siteUrl";

// Font loading budget:
//  - Sora is only ever used for headings, and only at font-bold (700) and
//    font-extrabold (800) — 600 was never referenced, so it's not shipped.
//  - Inter is a *variable* font: one file covers every weight the body uses
//    (400/500/600/700) instead of one file per weight.
//  - display: "swap" shows text immediately in the fallback font, and
//    next/font's size-adjusted fallback keeps the swap from shifting layout.
//  - Latin subset only. Both are self-hosted by next/font at build time
//    (no request to Google's servers, immutable-cached like any static asset).
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", weight: ["700", "800"], display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Direct2Hub — The Ecommerce Playbook",
    template: "%s | Direct2Hub",
  },
  description:
    "The Ecommerce Playbook: a practical, beginner-friendly guide to start, sell, and scale an ecommerce business. Get instant access to 120+ product ideas, a profit calculator, and a 30-day launch plan.",
  keywords: [
    "ecommerce playbook",
    "start ecommerce business",
    "dropshipping guide",
    "Direct2Hub",
    "product sourcing",
    "sell on Amazon Flipkart Meesho",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Direct2Hub",
    title: "Direct2Hub — The Ecommerce Playbook",
    description:
      "A practical, beginner-friendly guide to start, sell, and scale an ecommerce business.",
    images: [{ url: "/uploads/hero-placeholder.png", width: 1200, height: 675 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Direct2Hub — The Ecommerce Playbook",
    description:
      "A practical, beginner-friendly guide to start, sell, and scale an ecommerce business.",
    images: ["/uploads/hero-placeholder.png"],
  },
};

// Runs before React hydrates so the very first paint already has the right
// theme — no light-flash-then-dark flicker. Mirrors components/ThemeProvider.tsx:
// light unless the person has manually switched to dark before (saved in a
// first-party cookie — the site never uses localStorage). There is no longer a time-of-day auto mode — the site used
// to flip itself to dark in the evening on its own, which is not what
// "dark mode" is supposed to mean; it should only ever be the visitor's choice.
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var m = document.cookie.match(/(?:^|;\\s*)d2h-theme=([^;]*)/);
    var theme = m && decodeURIComponent(m[1]) === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    root.style.colorScheme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
        <VisitorTracker />
      </body>
    </html>
  );
}
