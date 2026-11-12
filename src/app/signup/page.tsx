import { Suspense } from "react";
import { AuthShell } from "@/components/shared/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">Order from local shops near you in minutes.</p>
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
