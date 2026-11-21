import Link from "next/link";
import { CheckCircle2, FileSignature, Link2Off } from "lucide-react";
import { agreementForToken } from "@/server/services/agreement";
import { AppError } from "@/server/errors";
import { Card } from "@/components/ui/card";
import { SignPanel } from "./sign-panel";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Seller agreement",
  robots: { index: false, follow: false },
};

const fmtDay = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
const fmtWhen = (d: Date) =>
  new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-muted/40 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-4">{children}</div>
    </main>
  );
}

export default async function AgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let ag;
  try {
    ag = await agreementForToken(token);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) {
      return (
        <Shell>
          <Card className="items-center gap-3 p-8 text-center">
            <Link2Off className="size-10 text-muted-foreground" />
            <h1 className="text-xl font-bold">This link doesn&apos;t work</h1>
            <p className="max-w-md text-sm text-muted-foreground">
              Check that you opened the full link from the agreement email, or ask your dealer or the Dukaan Express team to send it again.
            </p>
          </Card>
        </Shell>
      );
    }
    throw e;
  }
  const t = ag.terms;
  const key = [
    ["Commission", `${t.commercial.commission} of item value per delivered order`],
    ["Delivery", t.commercial.deliveryMode],
    ["Accept orders within", `${t.commercial.acceptMinutes} minutes`],
    ["Payouts", `On request, within ${t.commercial.payoutDays} working days`],
  ];

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-bold text-primary">{t.platform.brand}</p>
        <p className="text-xs text-muted-foreground">{t.number}</p>
      </div>

      {ag.status === "ACCEPTED" && ag.acceptedAt && (
        <Card className="flex-row items-start gap-3 border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">
              Signed by {ag.acceptedName} on {fmtWhen(ag.acceptedAt)} IST
            </p>
            <p>
              Your shop is ready. A signed copy was emailed to you.{" "}
              <Link href="/login/staff?next=/shop" className="font-semibold underline">
                Open the shop panel
              </Link>
            </p>
          </div>
        </Card>
      )}
      {ag.status === "VOID" && (
        <Card className="flex-row items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <Link2Off className="mt-0.5 size-5 shrink-0" />
          <p>
            <b>A newer agreement email was sent.</b> This link no longer works. Please open the latest email sent to {ag.email}.
          </p>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 p-5 text-white sm:p-7">
          <FileSignature className="mb-3 size-8 opacity-90" />
          <h1 className="text-2xl font-bold sm:text-3xl">Seller Agreement</h1>
          <p className="mt-1 text-sm text-emerald-50/90">
            {t.shop.name} · issued {fmtDay(t.issuedOn)}
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
          <div className="space-y-1 text-sm">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Platform</p>
            <p className="font-semibold">{t.platform.entity}</p>
            {t.platform.address && <p className="text-muted-foreground">{t.platform.address}</p>}
            {t.platform.gstin && <p className="text-muted-foreground">GSTIN {t.platform.gstin}</p>}
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Seller</p>
            <p className="font-semibold">{t.shop.name}</p>
            <p className="text-muted-foreground">{t.shop.address}</p>
            <p className="break-words text-muted-foreground">
              {t.owner.name} · {t.owner.email}
              {t.owner.phone ? ` · ${t.owner.phone}` : ""}
            </p>
            {t.shop.gstin && <p className="text-muted-foreground">GSTIN {t.shop.gstin}</p>}
            {t.dealer && <p className="text-muted-foreground">Onboarded by {t.dealer}</p>}
          </div>
        </div>
        <div className="mx-5 mb-5 grid gap-px overflow-hidden rounded-xl border bg-border sm:mx-7 sm:mb-7 sm:grid-cols-2">
          {key.map(([k, v]) => (
            <div key={k} className="bg-card p-3">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="text-sm font-semibold">{v}</p>
            </div>
          ))}
        </div>
        <div className="space-y-5 border-t p-5 text-sm leading-relaxed sm:p-7">
          {t.sections.map((s) => (
            <section key={s.title}>
              <h2 className="mb-1.5 font-semibold">{s.title}</h2>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {s.items.map((i, n) => (
                  <li key={n}>{i}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Card>

      {ag.status === "PENDING" && <SignPanel token={token} email={ag.email} ownerName={t.owner.name} />}
    </Shell>
  );
}
