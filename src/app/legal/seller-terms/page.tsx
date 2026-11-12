import { legalContext } from "../_lib/context";
import { Doc, List, Mail, Section } from "../_lib/ui";

export const metadata = { title: "Seller Terms" };

export default async function SellerTermsPage() {
  const c = await legalContext();
  return (
    <Doc
      title="Seller Terms"
      updated={c.updated}
      intro={
        <p>
          These terms apply to shops (&quot;Sellers&quot;) that sell on {c.brand}, operated by <b>{c.entity}</b>. They are in addition to the Terms of Use and the commercial terms agreed when your shop was
          onboarded. By using the shop panel or app you accept them.
        </p>
      }
    >
      <Section title="1. Onboarding and compliance">
        <List>
          <li>Your shop is listed only after our team approves it. You must give accurate business, contact, address and GST details and keep them up to date.</li>
          <li>You must hold and keep valid every licence your business needs, for example GST registration, FSSAI licence for food, and a drug licence for medicines, and show them to us on request.</li>
          <li>You are the seller of the goods you list, and are responsible for complying with the Legal Metrology Act, food-safety, drug and consumer-protection laws.</li>
        </List>
      </Section>

      <Section title="2. Listings, prices and stock">
        <List>
          <li>Listings must be accurate: correct product, quantity, MRP, expiry and images. Never charge above the MRP.</li>
          <li>Keep stock and opening hours up to date. Do not list prohibited, counterfeit, expired or unsafe products.</li>
          <li>The selling price you set is what the customer pays for the item, including GST, unless the Platform settings say otherwise.</li>
        </List>
      </Section>

      <Section title="3. Handling orders">
        <List>
          <li>Accept or reject each new order within {c.shopAcceptMinutes} minutes; otherwise it is rejected automatically. Frequent rejections or no-responses may lead to your shop being paused.</li>
          <li>Prepare and pack orders promptly and safely, with correct, unexpired items, and hand them to the delivery partner.</li>
          <li>If an item is unavailable, propose an order modification in the app instead of substituting without the customer&apos;s consent.</li>
          <li>Customer contact details may only be used to fulfil that order, never for marketing or shared with anyone else.</li>
        </List>
      </Section>

      <Section title="4. Commission and earnings">
        <List>
          <li>
            For each delivered order we keep a platform commission on the item value after coupons (currently {c.defaultCommission} unless a different rate was agreed for your shop). The rest is your earning.
          </li>
          <li>Delivery fees and taxes collected on delivery charges belong to the Platform. Your earnings per order, the commission deducted and your available balance are shown in <b>Earnings &amp; payouts</b>.</li>
          <li>Earnings from orders that are cancelled, rejected or fully refunded are not payable. If a refund is given after delivery because of a problem caused by your shop, its value may be adjusted from future earnings.</li>
          <li>We may change the default commission with 15 days&apos; notice in the shop panel.</li>
        </List>
      </Section>

      <Section title="5. Payouts">
        <List>
          <li>Add a bank account in your name or your business&apos;s name in <b>Earnings &amp; payouts</b>. The account number is stored encrypted and shown only in masked form. Changes are recorded and our team is alerted.</li>
          <li>You can request a payout of your available balance at any time. We aim to transfer approved requests within 3 working days by IMPS, NEFT, RTGS or UPI, and record the transaction reference (UTR) in your payout history.</li>
          <li>We may hold or decline a payout if bank details do not match, if there is suspected fraud, or if there are unresolved customer complaints, and will tell you the reason. A declined request returns to your available balance.</li>
          <li>You are responsible for your own income tax and GST filings. Where the law requires us to collect TCS or deduct TDS on your sales, we will do so and give you the statement.</li>
        </List>
      </Section>

      <Section title="6. Suspension and termination">
        <p>
          We may pause or remove your shop for breaking these terms, poor service, customer safety concerns or legal requirements. You may stop selling at any time by telling us. Earnings for delivered orders
          remain payable after termination, less any amounts owed to customers or to us.
        </p>
      </Section>

      <Section title="7. Contact">
        <p>
          Seller support: <Mail to={c.supportEmail} />, {c.supportPhone}. Disputes are governed by Indian law and the courts at {c.jurisdiction}.
        </p>
      </Section>
    </Doc>
  );
}
