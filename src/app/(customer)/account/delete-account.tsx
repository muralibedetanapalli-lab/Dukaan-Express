"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/shared/auth-fields";
import { api, errorMessage } from "@/lib/api-client";

/** Self-service account deletion (required by Google Play for apps with sign-up). */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/auth/account/delete", { method: "POST", body: { password } });
      toast.success("Your account has been deleted");
      // Full reload so every cached page drops the old session.
      window.location.replace("/");
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 border-destructive/30 p-5">
      <p className="flex items-center gap-2 font-semibold text-destructive">
        <Trash2 className="size-5" /> Delete account
      </p>
      <p className="text-sm text-muted-foreground">
        Permanently delete your account, saved addresses and cart. Past order records are kept only as required by law.{" "}
        <Link href="/legal/delete-account" className="font-medium text-primary hover:underline">
          What gets deleted
        </Link>
      </p>
      <div>
        <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return;
          setOpen(o);
          if (!o) setPassword("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={remove} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This can&apos;t be undone. You&apos;ll be logged out, and your name, email, mobile number, saved addresses and cart will be erased. You can sign up again later with the same
                email or mobile number.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="del-pw">Enter your password to confirm</Label>
              <PasswordInput id="del-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Keep my account
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || !password}>
                {busy && <Loader2 className="animate-spin" />} Delete permanently
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
