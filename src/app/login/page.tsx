import Link from "next/link";
import { Suspense } from "react";
import { OtpLoginForm } from "./otp-form";
import { AuthShell } from "@/components/shared/auth-shell";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">Log in or sign up</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter your mobile number to get a one-time password.</p>
      <Suspense>
        <OtpLoginForm />
      </Suspense>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Shop owner or admin?{" "}
        <Link href="/login/staff" className="font-medium text-primary hover:underline">
          Staff login
        </Link>
      </p>
    </AuthShell>
  );
}

