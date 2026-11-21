import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Metech ERP" button on admin detail pages: opens the matching CRM / accounting record in Metech ERP.
 * Shown only when ERP_URL is set. Types: shop, owner, dealer, rider, customer, order.
 */
export function ErpLink({ type, id }: { type: "shop" | "owner" | "dealer" | "rider" | "customer" | "order"; id: string }) {
  const base = process.env.ERP_URL?.trim();
  if (!base) return null;
  const href = new URL(`/link/dukaan/${type}/${encodeURIComponent(id)}`, base).toString();
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={href} target="_blank" rel="noreferrer">
        Metech ERP <ExternalLink />
      </a>
    </Button>
  );
}
