// Single source for the policy pages, the footer links and the sitemap.
// Cashfree reviews a website before it will whitelist the domain for live
// payments, and requires visible Contact Us, Terms and Conditions and
// Refunds and Cancellations pages (plus products/services with prices in INR).
export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refunds & Cancellations" },
  { href: "/contact", label: "Contact Us" },
] as const;

// Bump this when you change the wording of a policy.
export const POLICIES_LAST_UPDATED = "21 September 2026";
