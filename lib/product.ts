import { prisma } from "@/lib/db";
import type { ProductView } from "@/lib/types";

export const FALLBACK_PRODUCT: ProductView = {
  id: "demo",
  title: "The Ecommerce Playbook – Start, Sell & Scale Your Ecommerce Business",
  tagline: "A Practical Beginner's Guide to Start, Sell & Scale an Ecommerce Business",
  aboutTitle: "About the page",
  about:
    "The Ecommerce Playbook is a practical beginner-friendly guide to help you start, sell, and scale an ecommerce business.\n\nInside, you'll learn how to find winning products, source from reliable suppliers, calculate profit, price correctly, sell on Amazon, Flipkart & Meesho, get your first sales, and scale your business.",
  bullets: ["Digital Ebook", "Instant Access", "One-Time Setup"],
  learnFrom: "Direct2Hub",
  learnFromBio: "B2B Product Sourcing Platform for Ecommerce Sellers & Resellers",
  contactPhone: "+91 7483274168",
  whatsappUrl: "https://wa.me/917483274168",
  whatsappGroupUrl: "https://chat.whatsapp.com/your-group-link",
  youtubeUrl: "https://youtube.com",
  instagramUrl: "https://instagram.com",
  logoUrl: "/uploads/logo-placeholder.png",
  heroImageUrl: "/uploads/hero-placeholder.png",
  videoUrl: "/videos/showcase.mp4",
  previewImage1Url: "/uploads/pdf-preview/page-01.jpg",
  previewImage2Url: "/uploads/pdf-preview/page-02.jpg",
  previewImage3Url: "/uploads/pdf-preview/page-03.jpg",
  pdfSizeKb: 422,
};

export async function getProduct(): Promise<ProductView> {
  try {
    const product = await prisma.product.findFirst({ orderBy: { updatedAt: "desc" } });
    return product || FALLBACK_PRODUCT;
  } catch (err) {
    // Falling back to demo content here is intentional so the site still
    // renders instead of showing a blank error page — but log it, since a
    // real DB outage (wrong password, connection reset, paused project)
    // looks identical to "no DATABASE_URL set yet" otherwise. Check your
    // server logs for this line if the live site is unexpectedly showing
    // demo/placeholder content instead of your real product data.
    console.error("getProduct(): falling back to demo content —", err);
    return FALLBACK_PRODUCT;
  }
}
