import type { Metadata } from "next";
import PolicyPage, { PolicySection } from "@/components/PolicyPage";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms that apply when you buy and use The Ecommerce Playbook from Direct2hub.",
};

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms & Conditions"
      intro="These terms apply when you buy or use The Ecommerce Playbook and its bonus resources from Direct2hub (“we”, “us”). By placing an order you agree to them."
    >
      <PolicySection title="1. Digital product">
        <p>The Ecommerce Playbook is a digital ebook with related bonus resources. Nothing physical is shipped.</p>
      </PolicySection>
      <PolicySection title="2. Price and payment">
        <p>
          The price is shown in Indian Rupees (INR) on the pricing page before you pay. Payments are processed securely by
          Cashfree Payments (UPI, cards, netbanking and wallets). We never see or store your card, UPI or bank details.
        </p>
      </PolicySection>
      <PolicySection title="3. Delivery, access and downloads">
        <p>
          After your payment is confirmed you get instant access on this site and a confirmation email with your private
          download link and invoice. Your link is personal to you and works on up to 2 devices, with up to 3 downloads in
          total. Keep it private — anyone who has the link can use up its limits.
        </p>
      </PolicySection>
      <PolicySection title="4. Personal use only">
        <p>
          Your purchase is for your personal use. You may not copy, resell, redistribute, share, upload or reproduce the
          ebook or bonus materials without our written permission.
        </p>
      </PolicySection>
      <PolicySection title="5. No guaranteed results">
        <p>
          The content is educational and informational. Ecommerce results depend on product selection, pricing, market
          conditions, effort, competition and execution. We do not guarantee any particular sales, profit or business result.
        </p>
      </PolicySection>
      <PolicySection title="6. Accuracy of information">
        <p>
          We aim to be practical and accurate, but marketplace rules, fees, policies and prices change over time. Check
          current rules before you rely on any figure.
        </p>
      </PolicySection>
      <PolicySection title="7. Refunds and cancellations">
        <p>
          Please read our{" "}
          <a href="/refund-policy" className="font-semibold text-ember-600 underline underline-offset-4">
            Refunds &amp; Cancellations
          </a>{" "}
          page. Because the product is digital and delivered instantly, refunds are limited to the cases described there.
        </p>
      </PolicySection>
      <PolicySection title="8. Intellectual property">
        <p>
          All content, designs, worksheets, calculators and materials in The Ecommerce Playbook remain the intellectual
          property of Direct2hub.
        </p>
      </PolicySection>
      <PolicySection title="9. Privacy">
        <p>
          How we handle your information is described in our{" "}
          <a href="/privacy" className="font-semibold text-ember-600 underline underline-offset-4">
            Privacy Policy
          </a>
          .
        </p>
      </PolicySection>
      <PolicySection title="10. Changes and governing law">
        <p>
          We may update these terms when needed; the date at the top shows the latest version. These terms are governed by
          the laws of India.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
