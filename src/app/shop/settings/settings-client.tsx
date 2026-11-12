"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { KeyValue } from "@/components/shared/misc";
import { api, errorMessage } from "@/lib/api-client";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Hours = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };

export function ShopSettingsClient({ shop }: { shop: { name: string; avgPrepMinutes: number; deliveryRadiusKm: number; address: string; hours: Hours[] } }) {
  const router = useRouter();
  const [hours, setHours] = useState<Hours[]>(() => DAYS.map((_, d) => shop.hours.find((h) => h.dayOfWeek === d) ?? { dayOfWeek: d, openTime: "08:00", closeTime: "22:00", isClosed: false }));
  const [prep, setPrep] = useState(String(shop.avgPrepMinutes));
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [pwBusy, setPwBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/shop/me", { method: "PATCH", body: { hours, avgPrepMinutes: Number(prep) || 10 } });
      toast.success("Settings saved");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="gap-0 p-4">
        <p className="mb-2 font-semibold">Shop profile</p>
        <KeyValue label="Name">{shop.name}</KeyValue>
        <KeyValue label="Pickup address">{shop.address}</KeyValue>
        <KeyValue label="Delivery radius">{shop.deliveryRadiusKm} km</KeyValue>
      </Card>
      <Card className="gap-4 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Clock className="size-5 text-primary" /> Operating hours
        </p>
        <ul className="space-y-2">
          {hours.map((h, i) => (
            <li key={h.dayOfWeek} className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-sm font-medium">{DAYS[h.dayOfWeek]}</span>
              <Switch checked={!h.isClosed} onCheckedChange={(v) => setHours((hs) => hs.map((x, j) => (j === i ? { ...x, isClosed: !v } : x)))} aria-label={`${DAYS[h.dayOfWeek]} open`} />
              {h.isClosed ? (
                <span className="text-sm text-muted-foreground">Closed</span>
              ) : (
                <>
                  <Input type="time" value={h.openTime} onChange={(e) => setHours((hs) => hs.map((x, j) => (j === i ? { ...x, openTime: e.target.value } : x)))} className="w-32" />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input type="time" value={h.closeTime} onChange={(e) => setHours((hs) => hs.map((x, j) => (j === i ? { ...x, closeTime: e.target.value } : x)))} className="w-32" />
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="prep">Average preparation time (minutes)</Label>
          <Input id="prep" value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
          <p className="text-xs text-muted-foreground">Used to estimate delivery time for customers.</p>
        </div>
        <Button onClick={save} disabled={busy} className="self-start">
          {busy && <Loader2 className="animate-spin" />} Save
        </Button>
      </Card>
      <Card className="gap-3 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-5 text-primary" /> Change password
        </p>
        <form
          className="grid gap-3 sm:grid-cols-3 sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setPwBusy(true);
            try {
              await api("/auth/password", { body: pw });
              toast.success("Password changed");
              setPw({ currentPassword: "", newPassword: "" });
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setPwBusy(false);
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="cpw">Current password</Label>
            <Input id="cpw" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="npw">New password</Label>
            <Input id="npw" type="password" autoComplete="new-password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required />
          </div>
          <Button type="submit" variant="outline" disabled={pwBusy}>
            {pwBusy && <Loader2 className="animate-spin" />} Update password
          </Button>
        </form>
      </Card>
      <Card className="gap-2 p-4">
        <p className="font-semibold">Policies</p>
        <p className="text-sm text-muted-foreground">
          Selling on the platform is covered by the{" "}
          <Link href="/legal/seller-terms" className="font-medium text-primary hover:underline">
            Seller Terms
          </Link>
          {" "}(commission, payouts, order handling) and the{" "}
          <Link href="/legal/privacy" className="font-medium text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
