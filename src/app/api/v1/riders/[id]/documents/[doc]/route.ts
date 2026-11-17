import { api } from "@/server/http";
import { notFound } from "@/server/errors";
import { readPrivateDocument } from "@/server/integrations/storage";
import { KYC_DOCS, reviewableRider, type KycDoc } from "@/server/services/rider-kyc";

const FIELD = { aadhaarFront: "aadhaarFrontRef", aadhaarBack: "aadhaarBackRef", license: "licenseRef", rc: "rcRef" } as const;

/** Stream a rider document image to the rider, their dealer or an admin. Never cached, never a public URL. */
export const GET = api({ roles: ["RIDER", "DEALER", "SUPER_ADMIN"], rateLimit: { name: "kyc-view", limit: 120 } }, async ({ user, params }) => {
  const doc = params.doc as KycDoc;
  if (!(KYC_DOCS as readonly string[]).includes(doc)) throw notFound("Document");
  const rider = await reviewableRider(user, params.id);
  const ref = rider[FIELD[doc]];
  if (!ref) throw notFound("Document");
  const file = await readPrivateDocument(ref);
  if (!file) throw notFound("Document");
  return new Response(new Uint8Array(file.body), {
    headers: { "Content-Type": file.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
