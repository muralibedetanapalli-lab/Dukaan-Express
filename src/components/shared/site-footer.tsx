import Link from "next/link";
import { POWERED_BY } from "./brand";

const LINKS = [
  { href: "/legal/terms", label: "Terms of Use" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/refunds", label: "Cancellations & Refunds" },
  { href: "/legal/shipping", label: "Shipping & Delivery" },
  { href: "/legal/seller-terms", label: "Seller Terms" },
  { href: "/legal/delete-account", label: "Delete Account" },
  { href: "/legal/contact", label: "Contact Us" },
];

/** Policy links required by payment gateways and app stores; shown on the storefront and policy pages. */
export function SiteFooter({ brand = "Dukaan Express", entity }: { brand?: string; entity?: string }) {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Policies" className="flex flex-wrap gap-x-4 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {entity || brand} · Powered by {POWERED_BY}
        </p>
      </div>
    </footer>
  );
}
