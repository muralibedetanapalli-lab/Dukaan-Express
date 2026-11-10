"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api-client";

/** Button + confirmation dialog, with optional required reason. */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  requireReason,
  reasonLabel = "Reason",
  onConfirm,
  successMessage,
  variant,
  size,
  className,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<unknown>;
  successMessage?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  async function run(e: React.MouseEvent) {
    e.preventDefault();
    if (requireReason && reason.trim().length < 3) {
      toast.error("Please enter a reason (at least 3 characters)");
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      if (successMessage) toast.success(successMessage);
      setOpen(false);
      setReason("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant ?? (destructive ? "destructive" : "default")} size={size} className={className} disabled={disabled}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {requireReason && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-reason">{reasonLabel}</Label>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} autoFocus />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={run} disabled={busy} className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}>
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
