import Link from "next/link";
import { Zap } from "lucide-react";
import { SiteFooter } from "@/components/shared/site-footer";
import { BrandName } from "@/components/shared/brand";
import { LegalNav } from "./legal-nav";
import { legalContext, POLICIES } from "./_lib/context";

/** Public policy pages: readable by everyone (customers, shop owners, payment-gateway and app-store reviewers), no login. */
export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const c = await legalContext();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-primary">
            <Zap className="size-5" /> <BrandName name={c.brand} poweredClassName="text-muted-foreground opacity-100" />
          </Link>
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Back to shopping
          </Link>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 md:grid-cols-[220px_1fr] md:gap-10 md:py-10">
        <LegalNav items={POLICIES.map((p) => ({ href: `/legal/${p.slug}`, label: p.short }))} />
        <div className="pb-12">{children}</div>
      </div>
      <SiteFooter brand={c.brand} entity={c.entity} />
    </div>
  );
}
