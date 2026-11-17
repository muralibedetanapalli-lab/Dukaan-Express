import Link from "next/link";
import { AuthShell } from "@/components/shared/auth-shell";
import { ForgotPasswordForm } from "./forgot-form";
import { nativeApp } from "@/server/native-app";

export const metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  // Each app only offers its own login.
  const app = await nativeApp();
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">We&apos;ll email you a code to set a new password.</p>
      <ForgotPasswordForm />
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Remembered it?{" "}
        {app === "customer" ? (
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        ) : app === "shop" || app === "rider" ? (
          <Link href={`/login/staff?next=/${app}`} className="font-medium text-primary hover:underline">
            Log in
          </Link>
        ) : (
          <>
            <Link href="/login" className="font-medium text-primary hover:underline">
              Customer login
            </Link>{" "}
            ·{" "}
            <Link href="/login/staff" className="font-medium text-primary hover:underline">
              Staff login
            </Link>
          </>
        )}
      </p>
    </AuthShell>
  );
}
