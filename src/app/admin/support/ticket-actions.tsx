"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api-client";

export function TicketActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const update = async (next: string) => {
    setBusy(next);
    try {
      await api(`/admin/tickets/${id}`, { method: "PATCH", body: { status: next, resolution: reply || null } });
      toast.success("Ticket updated");
      setReply("");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  if (status === "CLOSED") return null;
  return (
    <div className="space-y-2">
      <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply / resolution note (sent to the customer)" rows={2} />
      <div className="flex flex-wrap gap-2">
        {status === "OPEN" && (
          <Button size="sm" variant="outline" onClick={() => update("IN_PROGRESS")} disabled={!!busy}>
            {busy === "IN_PROGRESS" && <Loader2 className="animate-spin" />} Mark in progress
          </Button>
        )}
        <Button size="sm" onClick={() => update("RESOLVED")} disabled={!!busy || !reply.trim()}>
          {busy === "RESOLVED" && <Loader2 className="animate-spin" />} Resolve
        </Button>
        <Button size="sm" variant="ghost" onClick={() => update("CLOSED")} disabled={!!busy}>
          Close
        </Button>
      </div>
    </div>
  );
}
