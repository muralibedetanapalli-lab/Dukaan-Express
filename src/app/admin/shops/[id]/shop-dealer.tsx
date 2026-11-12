"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api-client";

const NONE = "none";

/** Which regional dealer manages this shop (sees it, approves its payouts, earns a share of commission). */
export function ShopDealerCard({ shopId, dealerId, dealers, suggested }: { shopId: string; dealerId: string | null; dealers: { id: string; name: string; regions: string }[]; suggested: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(dealerId ?? NONE);
  const [busy, setBusy] = useState(false);
  const changed = value !== (dealerId ?? NONE);
  const current = dealers.find((d) => d.id === dealerId);
  const hint = dealers.find((d) => d.id === suggested);

  async function save() {
    setBusy(true);
    try {
      await api(`/admin/shops/${shopId}/dealer`, { method: "PATCH", body: { dealerId: value === NONE ? null : value } });
      toast.success(value === NONE ? "Dealer removed" : "Dealer assigned");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex-row flex-wrap items-center gap-3 p-4">
      <Handshake className="size-5 text-primary" />
      <div className="min-w-40 flex-1">
        <p className="text-sm font-semibold">Dealer</p>
        <p className="text-xs text-muted-foreground">
          {current ? `${current.name} approves this shop's payouts before they reach you.` : "No dealer — payout requests come straight to you."}
          {!current && hint ? ` Region dealer: ${hint.name}.` : ""}
        </p>
      </div>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No dealer</SelectItem>
          {dealers.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
              {d.regions ? ` · ${d.regions}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={save} disabled={!changed || busy}>
        {busy && <Loader2 className="animate-spin" />} Save
      </Button>
    </Card>
  );
}
