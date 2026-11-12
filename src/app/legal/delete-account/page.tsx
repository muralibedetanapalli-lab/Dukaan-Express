import Link from "next/link";
import { legalContext } from "../_lib/context";
import { Callout, Doc, List, Mail, Section } from "../_lib/ui";

export const metadata = { title: "Delete your account" };

/** Public account-deletion page: the "delete account URL" asked for by Google Play's Data safety form. */
export default async function DeleteAccountPage() {
  const c = await legalContext();
  return (
    <Doc
      title="Delete your account"
      updated={c.updated}
      intro={
        <p>
          You can delete your {c.brand} account at any time, from the app or the website. This page explains how, and what happens to your data. It applies to the <b>{c.brand}</b> customer app
          and the <b>Dukaan Partner</b> app for sellers, both published by {c.entity}.
        </p>
      }
    >
      <Section title="Customers: delete it yourself">
        <List>
          <li>
            Open the {c.brand} app (or{" "}
            <Link href="/account" className="font-medium text-primary hover:underline">
              this website
            </Link>
            ) and log in.
          </li>
          <li>
            Go to <b>Account</b> and scroll to <b>Delete account</b>.
          </li>
          <li>
            Tap <b>Delete my account</b>, enter your password and confirm. Deletion happens immediately.
          </li>
        </List>
        <Callout>
          If you have an order that is still in progress or waiting for a refund, please wait until it is completed. Can&apos;t log in? Reset your password from{" "}
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Forgot password
          </Link>
          , or email <Mail to={c.supportEmail} /> from the email address on your account and we&apos;ll delete it for you within 7 days.
        </Callout>
      </Section>

      <Section title="Sellers (Dukaan Partner app)">
        <p>
          Shop accounts hold payouts, invoices and tax records, so they are closed by our team. Email <Mail to={c.supportEmail} /> from your registered email with the subject{" "}
          <b>&quot;Delete my shop account&quot;</b>. We settle any pending payout to your bank account first, then close the shop and delete the account within 30 days.
        </p>
      </Section>

      <Section title="What is deleted">
        <List>
          <li>Your name, email address, mobile number and password</li>
          <li>Saved delivery addresses and their map locations</li>
          <li>Your cart, notifications and push-notification tokens</li>
          <li>Verification codes linked to your email or mobile number</li>
        </List>
        <p>Your email and mobile number become free again, so you can create a new account with them later.</p>
      </Section>

      <Section title="What is kept, and for how long">
        <List>
          <li>
            <b>Order and payment records</b> (items, amounts, the delivery address and contact used for each order, invoices and refunds) are kept for up to 8 years, because tax and
            accounting laws (including the GST and Income Tax Acts) require it. They are no longer linked to a name, email or mobile number on our platform.
          </li>
          <li>
            <b>Reviews and support tickets</b> stay, shown as &quot;Deleted user&quot;.
          </li>
          <li>
            <b>Security logs</b> (for example, that an account was deleted, and from which IP address) are kept for up to 1 year to prevent fraud.
          </li>
        </List>
        <p>
          See our{" "}
          <Link href="/legal/privacy" className="font-medium text-primary hover:underline">
            Privacy Policy
          </Link>{" "}
          for more.
        </p>
      </Section>
    </Doc>
  );
}
