import { legalContext } from "../_lib/context";
import { Callout, Doc, List, Mail, Section } from "../_lib/ui";

export const metadata = { title: "Cancellation & Refund Policy" };

export default async function RefundsPage() {
  const c = await legalContext();
  const stages = c.cancellable.length ? c.cancellable.join(", ") : "before the shop starts preparing it";
  return (
    <Doc
      title="Cancellation & Refund Policy"
      updated={c.updated}
      intro={<p>This policy explains when you can cancel an order on {c.brand}, what happens when a shop cannot fulfil it, and how and when refunds reach you.</p>}
    >
      <Callout>
        <b>In short:</b> you can cancel from the order page until the shop starts preparing your order. If a shop rejects your order or cannot supply something, you get that money back automatically, to the
        same payment method, usually within 5–7 working days.
      </Callout>

      <Section title="1. Cancelling an order">
        <List>
          <li>
            You can cancel from <b>My orders → your order → Cancel</b> while the order status is: {stages}.
          </li>
          <li>Once the shop is preparing or has packed your order, it can no longer be cancelled from the app because the goods are being prepared for you. Contact support if something is wrong.</li>
          <li>{c.cancellationFee ? `A cancellation fee of ${c.cancellationFee} may be deducted from the refund.` : "There is no cancellation fee."}</li>
          <li>Unpaid online orders are cancelled automatically after {c.paymentTimeoutMinutes} minutes. No money is taken for these.</li>
        </List>
      </Section>

      <Section title="2. When the shop cancels or changes your order">
        <List>
          <li>If the shop rejects your order, or does not respond within {c.shopAcceptMinutes} minutes, the order is cancelled{c.autoRefundOnReject ? " and a full refund starts automatically" : " and refunded in full"}.</li>
          <li>If an item is out of stock, the shop may propose a change (for example removing an item or reducing a quantity). You can accept or reject the change. You are only charged for what you receive, and the difference is refunded.</li>
          <li>We may cancel an order that looks fraudulent, has a pricing error, or cannot be delivered to the address given. Any amount paid is refunded in full.</li>
        </List>
      </Section>

      <Section title="3. Problems with a delivered order">
        <p>If an item is missing, damaged, expired, or not what you ordered:</p>
        <List>
          <li>report it within <b>24 hours</b> of delivery (within 2 hours for fresh, chilled or frozen items) using <b>Help</b> on the order page, with a photo where possible;</li>
          <li>we review the issue with the shop and, where the complaint is valid, give a refund for the affected items or arrange a replacement;</li>
          <li>sealed items with a manufacturer warranty are covered by the manufacturer&apos;s warranty terms;</li>
          <li>for hygiene and safety reasons, opened food, medicines and personal-care products cannot be returned unless they were damaged, defective or wrong when delivered.</li>
        </List>
      </Section>

      <Section title="4. How refunds are paid">
        <List>
          <li><b>Online payments (UPI, card, net banking, wallet):</b> refunded to the same payment method through our payment partner Cashfree Payments. Refunds are started within 24 hours of approval{c.autoRefundOnCancel ? " (immediately for cancellations made in the app)" : ""} and usually reach you in 5–7 working days, depending on your bank. UPI refunds are often faster.</li>
          <li><b>Cash on delivery:</b> if you paid cash and are owed a refund, we refund to a UPI ID or bank account you share with support, within 7 working days.</li>
          <li>You can see the refund status on the order page. If a refund has not reached you after 7 working days, contact us with the order number and we will share the bank reference (ARN/UTR).</li>
        </List>
      </Section>

      <Section title="5. Contact">
        <p>
          Write to <Mail to={c.supportEmail} /> or call {c.supportPhone}. If you are not satisfied with the resolution, contact our Grievance Officer, {c.grievance.name}, at <Mail to={c.grievance.email} />.
        </p>
      </Section>
    </Doc>
  );
}
