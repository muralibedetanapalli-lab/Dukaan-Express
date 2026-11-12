import { cn } from "@/lib/utils";

export const BRAND_NAME = "Dukaan Express";
export const POWERED_BY = "AbhayCart";

/** "Dukaan Express" with the "Powered by AbhayCart" line underneath, used wherever the product name is shown. */
export function BrandName({ name = BRAND_NAME, className, poweredClassName }: { name?: string; className?: string; poweredClassName?: string }) {
  return (
    <span className={cn("inline-flex flex-col leading-none", className)}>
      <span>{name}</span>
      <span className={cn("mt-0.5 text-[10px] font-medium tracking-wide opacity-70", poweredClassName)}>Powered by {POWERED_BY}</span>
    </span>
  );
}
