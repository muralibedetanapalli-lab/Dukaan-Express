import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { AuthShell } from "@/components/shared/auth-shell";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Log in with your email or mobile number and password.</p>
      <Suspense>
        <LoginForm />
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
