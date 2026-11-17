import { Suspense } from "react";
import { AuthShell } from "@/components/shared/auth-shell";
import { riderSignupAreas } from "@/server/services/rider-kyc";
import { SignupForm } from "../signup/signup-form";

export const metadata = { title: "Become a rider" };
export const dynamic = "force-dynamic";

/** Public: anyone can sign up as a Dukaan Express delivery rider (documents and approval come next). */
export default async function RiderSignupPage() {
  const areas = await riderSignupAreas();
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold">Become a delivery rider</h1>
      <p className="mt-1 text-sm text-muted-foreground">Deliver orders from local shops and earn on every delivery. After signing up you&apos;ll upload your documents for approval.</p>
      <Suspense>
        <SignupForm riderAreas={areas} />
      </Suspense>
    </AuthShell>
  );
}
