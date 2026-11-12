import { Mail as MailIcon, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { legalContext } from "../_lib/context";
import { Doc, Mail } from "../_lib/ui";

export const metadata = { title: "Contact Us" };

export default async function ContactPage() {
  const c = await legalContext();
  return (
    <Doc title="Contact Us" intro={<p>We&apos;re here to help with orders, payments, refunds, and selling on {c.brand}.</p>}>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Card className="gap-2 p-4">
          <MessageCircle className="size-5 text-primary" />
          <p className="font-semibold">Help with an order</p>
          <p className="text-sm text-muted-foreground">Open the order in the app and tap <b>Help</b>. It&apos;s the fastest way, because we see your order details straight away.</p>
        </Card>
        <Card className="gap-2 p-4">
          <MailIcon className="size-5 text-primary" />
          <p className="font-semibold">Email</p>
          <p className="text-sm">
            <Mail to={c.supportEmail} />
          </p>
        </Card>
        <Card className="gap-2 p-4">
          <Phone className="size-5 text-primary" />
          <p className="font-semibold">Phone</p>
          <p className="text-sm">
            <a href={`tel:${c.supportPhone.replace(/[^\d+]/g, "")}`} className="font-medium text-primary hover:underline">
              {c.supportPhone}
            </a>
          </p>
        </Card>
        <Card className="gap-2 p-4">
          <ShieldCheck className="size-5 text-primary" />
          <p className="font-semibold">Grievance officer</p>
          <p className="text-sm">
            {c.grievance.name}
            <br />
            <Mail to={c.grievance.email} />
            <br />
            {c.grievance.phone}
          </p>
        </Card>
      </div>
      <Card className="mt-3 gap-2 p-4">
        <MapPin className="size-5 text-primary" />
        <p className="font-semibold">{c.entity}</p>
        {c.address && <p className="text-sm text-muted-foreground">{c.address}</p>}
        {c.gstin && <p className="text-sm text-muted-foreground">GSTIN: {c.gstin}</p>}
      </Card>
    </Doc>
  );
}
