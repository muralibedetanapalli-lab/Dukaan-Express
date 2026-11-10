import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/shared/auth-shell";
import { StaffLoginForm } from "./staff-form";

export const metadata = { title: "Staff login" };

export default function StaffLoginPage() {
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">Staff login</h1>
      <p className="mt-1 text-sm text-muted-foreground">For platform administrators and shop owners.</p>
      <Suspense>
        <StaffLoginForm />
      </Suspense>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Shopping?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Customer login
        </Link>
      </p>
    </AuthShell>
  );
}
