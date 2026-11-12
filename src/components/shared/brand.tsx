import { cn } from "@/lib/utils";

export const BRAND_NAME = "Dukaan Express";

/** The product name as shown in headers and auth screens. */
export function BrandName({ name = BRAND_NAME, className }: { name?: string; className?: string }) {
  return <span className={cn("leading-none", className)}>{name}</span>;
}
