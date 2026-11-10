"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { api, errorMessage } from "@/lib/api-client";

/** One-click API action (optionally with confirmation / reason) that refreshes the page on success. */
export function ActionButton({
  path,
  method = "POST",
  body,
  children,
  confirm,
  requireReason,
  reasonKey = "reason",
  success = "Done",
  variant,
  size = "sm",
  destructive,
  showResult,
}: {
  path: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  children: React.ReactNode;
  confirm?: { title: string; description?: string; label?: string };
  requireReason?: boolean;
  reasonKey?: string;
  success?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  destructive?: boolean;
  /** Show a field of the response in the success toast, e.g. { field: "temporaryPassword", template: "Temp password: {value}" } */
  showResult?: { field: string; template: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const exec = async (reason?: string) => {
    const r = await api(path, { method, body: { ...(body ?? {}), ...(requireReason ? { [reasonKey]: reason } : {}) } });
    const value = showResult ? (r as Record<string, unknown> | null)?.[showResult.field] : null;
    const msg = showResult && value ? showResult.template.replace("{value}", String(value)) : null;
    toast.success(msg ?? success, msg && msg.length > 60 ? { duration: 15000 } : undefined);
    router.refresh();
  };
  if (confirm || requireReason) {
    return (
      <ConfirmButton
        title={confirm?.title ?? "Are you sure?"}
        description={confirm?.description}
        confirmLabel={confirm?.label ?? "Confirm"}
        requireReason={requireReason}
        destructive={destructive}
        variant={variant ?? (destructive ? "destructive" : "default")}
        size={size}
        onConfirm={(reason) => exec(reason)}
      >
        {children}
      </ConfirmButton>
    );
  }
  return (
    <Button
      variant={variant}
      size={size}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await exec();
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
