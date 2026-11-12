import { legalContext } from "../_lib/context";
import { Doc, List, Mail, Section } from "../_lib/ui";

export const metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  const c = await legalContext();
  return (
    <Doc
      title="Privacy Policy"
      updated={c.updated}
      intro={
        <p>
          This policy explains how <b>{c.entity}</b> (&quot;{c.brand}&quot;, &quot;we&quot;) collects, uses, shares and protects personal data when you use the {c.brand} website and apps. It is written to
          comply with the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and its rules. By using the Platform you consent to the processing described here.
        </p>
      }
    >
      <Section title="1. Data we collect">
        <List>
          <li><b>Account data:</b> your name, mobile number, email address and a securely hashed password (we never store your password in readable form).</li>
          <li><b>Delivery data:</b> addresses you save, their map location, and the location you choose to browse nearby shops.</li>
          <li><b>Order data:</b> items ordered, amounts, payment status, delivery status, reviews and support conversations.</li>
          <li><b>Payment data:</b> processed by Cashfree Payments. We receive the payment status, method type and a transaction reference, never your full card number, CVV or UPI PIN.</li>
          <li><b>Device data:</b> a push-notification token (if you allow notifications), browser or app version, IP address and basic logs needed for security.</li>
          <li><b>For shop owners:</b> business details, GST number, payout bank account (the account number is stored encrypted) and records of payouts.</li>
        </List>
        <p>We do not knowingly collect data from children under 18 without a parent&apos;s or guardian&apos;s consent.</p>
      </Section>

      <Section title="2. How we use it">
        <List>
          <li>to create your account, verify your email and sign you in;</li>
          <li>to show shops that deliver to you, take and deliver orders, collect payments and process refunds;</li>
          <li>to send order updates by notification or SMS, and to answer support requests;</li>
          <li>to pay Sellers and keep accounting and tax records;</li>
          <li>to prevent fraud and abuse, and keep the Platform secure;</li>
          <li>to improve the Platform using aggregated, non-identifying statistics.</li>
        </List>
        <p>We do not sell your personal data, and we do not use it for third-party advertising.</p>
      </Section>

      <Section title="3. Who we share it with">
        <p>Only what is needed for each purpose:</p>
        <List>
          <li><b>The Seller</b> fulfilling your order: your name, phone number, delivery address and order items.</li>
          <li><b>Delivery partners</b> (such as Shiprocket and its couriers): name, phone number and delivery address.</li>
          <li><b>Cashfree Payments</b>, to process payments and refunds.</li>
          <li><b>Service providers</b> that run parts of the Platform on our behalf: Microsoft Azure (hosting and database, in India), Google Firebase (push notifications), Google Maps (address lookup), Cloudinary (image storage), and our email and SMS providers (verification codes and order alerts).</li>
          <li><b>Authorities</b>, when required by law or to protect rights, safety and property.</li>
        </List>
        <p>These parties may only use your data to provide their service to us and must protect it.</p>
      </Section>

      <Section title="4. How long we keep it">
        <p>
          We keep account data while your account is active. Order and payment records are kept for up to 8 years because tax and accounting laws require it. Verification and password-reset codes are deleted within a day. When data is no longer
          needed we delete or anonymise it.
        </p>
      </Section>

      <Section title="5. Security">
        <p>
          Data is sent over encrypted connections (HTTPS). Passwords are hashed, bank account numbers are encrypted at rest, access to admin tools is restricted and logged, and payment details are handled by a
          PCI-DSS compliant gateway. No system is perfectly secure, so please keep your password and verification codes private and tell us immediately if you suspect misuse.
        </p>
      </Section>

      <Section title="6. Your rights">
        <p>Under the Digital Personal Data Protection Act, 2023 you can:</p>
        <List>
          <li>ask for a summary of the personal data we hold about you and who we shared it with;</li>
          <li>correct or update your data (most of it you can edit in your account);</li>
          <li>withdraw consent and ask us to delete your account and data, except records we must keep by law;</li>
          <li>nominate someone to exercise these rights if you are unable to;</li>
          <li>raise a grievance with us, and then with the Data Protection Board of India if it is not resolved.</li>
        </List>
        <p>
          To use any of these rights, including deleting your account, email <Mail to={c.supportEmail} /> from or mentioning your registered mobile number. We respond within 30 days.
        </p>
      </Section>

      <Section title="7. Cookies and notifications">
        <p>
          We use essential cookies to keep you signed in, remember your location and cart, and protect against fraud. We do not use advertising cookies. You can turn off push notifications at any time in your
          phone or browser settings.
        </p>
      </Section>

      <Section title="8. Changes">
        <p>We may update this policy. The date at the top shows the current version, and we will tell you on the Platform about significant changes.</p>
      </Section>

      <Section id="grievance" title="9. Contact and grievance officer">
        <p>
          <b>{c.grievance.name}</b>, {c.entity}
          {c.address ? `, ${c.address}` : ""}. Email <Mail to={c.grievance.email} />, phone {c.grievance.phone}. We acknowledge complaints within 48 hours and resolve them within one month.
        </p>
      </Section>
    </Doc>
  );
}
