import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/shared/auth-shell";
import { StaffLoginForm } from "./staff-form";
import { nativeApp } from "@/server/native-app";

export const metadata = { title: "Staff login" };

export default async function StaffLoginPage() {
  // The Partner and Rider apps are for staff only — no customer login link there.
  const app = await nativeApp();
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">Staff login</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {app === "shop" ? "For shop owners and dealers." : app === "rider" ? "For delivery riders." : "For shop owners, dealers, delivery riders and platform administrators."}
      </p>
      <Suspense>
        {/* Rider signup belongs to the Rider app (and the website), not the Partner app. */}
        <StaffLoginForm showRiderSignup={app !== "shop"} />
      </Suspense>
      {app !== "shop" && app !== "rider" && (
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Shopping?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Customer login
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
