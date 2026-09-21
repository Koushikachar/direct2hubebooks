import type { Metadata } from "next";
import PolicyPage, { PolicySection } from "@/components/PolicyPage";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal information Direct2hub collects, why, who it is shared with, and your choices.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      intro="This policy explains what information Direct2hub collects when you visit this site or buy The Ecommerce Playbook, how we use it, and the choices you have."
    >
      <PolicySection title="Information we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Order details:</strong> your name, email address and WhatsApp number, plus your order amount, payment
            status and the payment reference numbers.
          </li>
          <li>
            <strong>Messages and reviews:</strong> what you send through the contact form, and any review you post (your
            name, rating and comment are shown publicly).
          </li>
          <li>
            <strong>Usage information:</strong> a random visitor ID and the pages you view, used for simple visit counts;
            how many times a download link was opened and downloaded, and which browsers have claimed it.
          </li>
          <li>
            <strong>Technical information:</strong> your IP address, used briefly to prevent abuse (rate limiting) and kept in
            security logs.
          </li>
        </ul>
        <p>We do not see or store your card, UPI or bank details — those go directly to our payment gateway.</p>
      </PolicySection>
      <PolicySection title="How we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>To take payment, deliver the ebook, and email your download link and invoice.</li>
          <li>To send up to three reminder emails if you started an order but did not finish paying.</li>
          <li>To answer your messages and give support.</li>
          <li>To keep the site secure, prevent fraud and misuse, and understand which pages are useful.</li>
        </ul>
        <p>We do not sell your personal information and we do not run advertising trackers.</p>
      </PolicySection>
      <PolicySection title="Cookies">
        <p>We use only essential and simple first-party cookies:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your light/dark theme choice;</li>
          <li>a random visitor ID (visit counts);</li>
          <li>cookies that recognise the browser that claimed your download link, that let you edit your own review, and that confirm you started a payment;</li>
          <li>a note that you joined our WhatsApp community.</li>
        </ul>
        <p>None of them are used for advertising, and we do not use local storage.</p>
      </PolicySection>
      <PolicySection title="Who we share it with">
        <p>Only the service providers needed to run the store, each for its own purpose:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Cashfree Payments — payment processing;</li>
          <li>Supabase — database and file storage;</li>
          <li>Google (Gmail) — sending our emails;</li>
          <li>Upstash — abuse-prevention counters;</li>
          <li>our website hosting provider.</li>
        </ul>
        <p>We may also disclose information if the law requires it.</p>
      </PolicySection>
      <PolicySection title="Public information">
        <p>
          Reviews you post are public. To show that others are buying, the site may display a recent purchase notice with
          only a first name and a time.
        </p>
      </PolicySection>
      <PolicySection title="How long we keep it">
        <p>
          We keep order records for as long as needed to let you re-download, issue invoices and meet accounting and legal
          obligations. Contact messages are kept while we deal with your request.
        </p>
      </PolicySection>
      <PolicySection title="Your choices">
        <p>
          You can ask to see, correct or delete the personal information we hold about you (except records we must keep by
          law), or ask us to stop reminder emails. Use the contact details below and we will respond within a reasonable time.
        </p>
      </PolicySection>
      <PolicySection title="Security">
        <p>
          We use encrypted connections, restrict access to our systems, store download files privately, and limit how often
          sensitive actions can be attempted. No online service can promise absolute security, but we work to protect your
          information.
        </p>
      </PolicySection>
      <PolicySection title="Children">
        <p>This site is not directed at children under 18, and we do not knowingly collect their information.</p>
      </PolicySection>
      <PolicySection title="Changes">
        <p>We may update this policy; the date at the top shows the latest version.</p>
      </PolicySection>
    </PolicyPage>
  );
}
