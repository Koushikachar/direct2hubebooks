import type { Metadata } from "next";
import PolicyPage, { PolicySection } from "@/components/PolicyPage";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Refunds & Cancellations",
  description: "When refunds are available for The Ecommerce Playbook, and how to request one.",
};

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      title="Refunds & Cancellations"
      intro="The Ecommerce Playbook is a digital product delivered instantly after payment. This page explains what that means for cancellations and refunds."
    >
      <PolicySection title="Cancelling an order">
        <p>
          You can leave checkout at any time before paying — nothing is charged. Once a payment succeeds, access is granted
          immediately, so a paid order cannot be cancelled.
        </p>
      </PolicySection>
      <PolicySection title="When we will refund you">
        <ul className="list-disc space-y-1 pl-5">
          <li>You were charged more than once for the same order (we refund the duplicate).</li>
          <li>Your payment was successful but you did not receive access or the email, and we cannot resolve it.</li>
          <li>The file is damaged or unusable and we cannot provide a working copy.</li>
        </ul>
      </PolicySection>
      <PolicySection title="When refunds are not available">
        <p>
          Once the ebook has been downloaded or accessed, we cannot offer a refund for a change of mind, or because results
          differed from your expectations — the product is educational and outcomes are not guaranteed (see our Terms).
        </p>
      </PolicySection>
      <PolicySection title="How to request a refund">
        <p>
          Contact us within 7 days of your purchase with the email address you used at checkout and your payment reference
          (it is on your invoice). We will reply with a decision and any next steps.
        </p>
      </PolicySection>
      <PolicySection title="How long a refund takes">
        <p>
          Approved refunds are sent back to the original payment method through our payment gateway. It typically appears in
          your account within 5–7 working days, depending on your bank or payment provider.
        </p>
      </PolicySection>
      <PolicySection title="Money debited but the payment failed">
        <p>
          If your account was debited but the payment shows as failed or the page did not confirm it, the amount is normally
          reversed automatically by your bank or the payment gateway within a few working days. If it is not, contact us with
          the transaction details and we will help trace it.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
