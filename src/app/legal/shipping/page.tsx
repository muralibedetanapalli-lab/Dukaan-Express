import { legalContext } from "../_lib/context";
import { Doc, List, Mail, Section } from "../_lib/ui";

export const metadata = { title: "Shipping & Delivery Policy" };

export default async function ShippingPage() {
  const c = await legalContext();
  return (
    <Doc
      title="Shipping & Delivery Policy"
      updated={c.updated}
      intro={<p>{c.brand} delivers orders from local shops near you, within the same city. We do not ship outside India.</p>}
    >
      <Section title="1. Where we deliver">
        <List>
          <li>Each shop delivers within its own radius, up to {c.maxRadiusKm} km. Set your delivery location to see shops that can deliver to you.</li>
          <li>We only take orders for addresses inside our active service areas. If your address is outside them, the app will tell you before you pay.</li>
        </List>
      </Section>

      <Section title="2. Delivery time">
        <List>
          <li>The app shows an estimated delivery time for each shop, based on the shop&apos;s preparation time and the distance to you. Most orders are delivered the same day, often within an hour.</li>
          <li>Orders are only delivered while the shop is open. Orders placed when a shop is closed cannot be placed with that shop.</li>
          <li>Times are estimates, not guarantees. Traffic, weather, high demand or courier availability can cause delays; you will see live status updates on the order page.</li>
        </List>
      </Section>

      <Section title="3. Delivery charges">
        <List>
          <li>
            Delivery fee: {c.baseFee} for the first 2 km, plus {c.perKmFee} for each extra km{c.freeDeliveryAbove ? `. Delivery is free on orders above ${c.freeDeliveryAbove}` : ""}.
          </li>
          <li>The exact delivery fee and any taxes are shown on the checkout page before you pay. There are no hidden charges.</li>
        </List>
      </Section>

      <Section title="4. How your order is delivered">
        <List>
          <li>Once the shop packs your order, a delivery partner (through Shiprocket or the shop&apos;s own staff) picks it up and brings it to your address.</li>
          <li>You receive updates when the order is accepted, packed, picked up, out for delivery and delivered.</li>
          <li>Please check the package at delivery. Report anything missing or damaged as described in our Cancellation &amp; Refund Policy.</li>
        </List>
      </Section>

      <Section title="5. If a delivery fails">
        <List>
          <li>If the delivery partner cannot reach you or the address is wrong or inaccessible, they will try to contact you, and may attempt delivery again.</li>
          <li>If delivery still cannot be completed, the order is returned to the shop and cancelled. For prepaid orders the item value is refunded; delivery charges may not be refunded when the failure was due to incorrect address details or the customer being unavailable.</li>
        </List>
      </Section>

      <Section title="6. Contact">
        <p>
          Questions about a delivery? Use <b>Help</b> on the order page, email <Mail to={c.supportEmail} /> or call {c.supportPhone}.
        </p>
      </Section>
    </Doc>
  );
}
