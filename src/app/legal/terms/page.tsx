import Link from "next/link";
import { legalContext } from "../_lib/context";
import { Doc, List, Mail, Section } from "../_lib/ui";

export const metadata = { title: "Terms of Use" };

export default async function TermsPage() {
  const c = await legalContext();
  return (
    <Doc
      title="Terms of Use"
      updated={c.updated}
      intro={
        <>
          <p>
            These Terms of Use (&quot;Terms&quot;) govern your use of the {c.brand} website, mobile apps and related services (the &quot;Platform&quot;), operated by{" "}
            <b>{c.entity}</b>
            {c.address ? `, ${c.address}` : ""} (&quot;{c.brand}&quot;, &quot;we&quot;, &quot;us&quot;).
          </p>
          <p>By creating an account, placing an order or otherwise using the Platform, you agree to these Terms and to our <Link href="/legal/privacy" className="font-medium text-primary hover:underline">Privacy Policy</Link>. If you do not agree, please do not use the Platform.</p>
        </>
      }
    >
      <Section title="1. What the Platform is">
        <p>
          {c.brand} is an online marketplace that connects customers with independent local shops (&quot;Sellers&quot;) near them. Sellers list and sell their own products; we provide the technology,
          payment collection and delivery coordination. Unless a product page says otherwise, the Seller named on your order is the seller of the goods, and the contract of sale is between you and that
          Seller. We act as an intermediary as defined in the Information Technology Act, 2000 and comply with the Consumer Protection (E-Commerce) Rules, 2020.
        </p>
      </Section>

      <Section title="2. Eligibility and your account">
        <List>
          <li>You must be at least 18 years old, or use the Platform under the supervision of a parent or guardian who accepts these Terms.</li>
          <li>You create an account with your name, mobile number, a verified email address and a password. Keep your password and verification codes private; you are responsible for activity on your account.</li>
          <li>Give accurate details, especially your name, phone number and delivery address, so orders can be delivered.</li>
          <li>We may suspend or close accounts that break these Terms, misuse offers, or are used for fraud.</li>
        </List>
      </Section>

      <Section title="3. Products, prices and availability">
        <List>
          <li>Product descriptions, images, prices and stock are provided by Sellers. We try to keep them accurate but do not guarantee that every listing is error-free.</li>
          <li>Prices are in Indian Rupees and include applicable GST unless shown otherwise. Prices are never above the MRP printed on the product.</li>
          <li>The price you pay is the one shown at checkout. If a Seller cannot supply an item, they may propose a change to your order; you can accept or reject it, and you are refunded for anything not supplied.</li>
          <li>A minimum order value of {c.minOrder} may apply, and delivery fees are shown before you pay. See our <Link href="/legal/shipping" className="font-medium text-primary hover:underline">Shipping &amp; Delivery Policy</Link>.</li>
          <li>Some products (such as medicines that need a prescription, or age-restricted items) may only be sold if you meet the legal requirements for them.</li>
        </List>
      </Section>

      <Section title="4. Orders">
        <p>
          Placing an order is an offer to buy. An order is confirmed only when the Seller accepts it. Sellers may decline an order, for example if an item is out of stock or the address is outside their delivery
          area; if a Seller does not respond within {c.shopAcceptMinutes} minutes the order is cancelled automatically. Any amount you paid for a declined or cancelled order is refunded as described in our{" "}
          <Link href="/legal/refunds" className="font-medium text-primary hover:underline">Cancellation &amp; Refund Policy</Link>.
        </p>
      </Section>

      <Section title="5. Payments">
        <List>
          <li>Online payments (UPI, cards, net banking and wallets) are processed by our payment partner Cashfree Payments. We never see or store your full card number, CVV or UPI PIN.</li>
          <li>Online orders that are not paid within {c.paymentTimeoutMinutes} minutes are cancelled automatically.</li>
          {c.codEnabled && <li>Cash on delivery may be available for orders up to {c.codMax}. Please keep the exact amount ready.</li>}
          <li>Coupons and offers have their own conditions, cannot be exchanged for cash, and may be withdrawn if misused.</li>
        </List>
      </Section>

      <Section title="6. Delivery">
        <p>
          Delivery times shown are estimates. Delays can happen because of traffic, weather, courier availability or events outside our control. Please be available at the address you gave; see the{" "}
          <Link href="/legal/shipping" className="font-medium text-primary hover:underline">Shipping &amp; Delivery Policy</Link> for what happens if a delivery fails.
        </p>
      </Section>

      <Section title="7. Acceptable use">
        <p>You agree not to:</p>
        <List>
          <li>use the Platform for anything unlawful, fraudulent or harmful, or to buy goods for unlawful resale;</li>
          <li>place fake orders, abuse cash on delivery, or misuse coupons, referrals or refunds;</li>
          <li>harass or abuse Sellers, delivery partners or our staff;</li>
          <li>interfere with the Platform&apos;s security, scrape it, or access it through automated means without our permission;</li>
          <li>post reviews that are false, offensive, or that you were paid to write.</li>
        </List>
      </Section>

      <Section title="8. Reviews and content">
        <p>
          Reviews and ratings you post must be honest and about your own experience. You allow us to display them on the Platform. We may remove content that breaks these Terms or the law. The {c.brand} name,
          logo, design and software belong to us or our licensors and may not be copied without permission.
        </p>
      </Section>

      <Section title="9. Liability">
        <List>
          <li>Sellers are responsible for the quality, safety, labelling, legality and fitness of the products they sell, and for honouring manufacturer warranties.</li>
          <li>To the extent permitted by law, our total liability to you for any order is limited to the amount you paid for that order. We are not liable for indirect or consequential losses.</li>
          <li>Nothing in these Terms limits rights you have under the Consumer Protection Act, 2019 or any other law that cannot be excluded.</li>
        </List>
      </Section>

      <Section title="10. Changes and termination">
        <p>
          We may update these Terms from time to time. The date at the top shows the latest version; material changes will be notified on the Platform. Continuing to use the Platform after a change means you
          accept the updated Terms. You may stop using the Platform at any time and ask us to delete your account (see the Privacy Policy).
        </p>
      </Section>

      <Section title="11. Governing law and disputes">
        <p>
          These Terms are governed by the laws of India. Courts at {c.jurisdiction} have exclusive jurisdiction, subject to any right you have to approach a consumer commission. Please contact us first; most
          issues can be resolved quickly.
        </p>
      </Section>

      <Section id="grievance" title="12. Customer care and grievance officer">
        <p>
          For help with an order, use <b>Help</b> on the order page in the app, or write to <Mail to={c.supportEmail} /> / call {c.supportPhone}.
        </p>
        <p>
          If your concern is not resolved, you can contact our Grievance Officer: <b>{c.grievance.name}</b>, <Mail to={c.grievance.email} />, {c.grievance.phone}
          {c.address ? `, ${c.address}` : ""}. We acknowledge complaints within 48 hours and aim to resolve them within one month of receipt.
        </p>
      </Section>
    </Doc>
  );
}
