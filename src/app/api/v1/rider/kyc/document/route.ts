import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { KYC_DOCS, saveKycDocument, type KycDoc } from "@/server/services/rider-kyc";

/** multipart/form-data: doc=<aadhaarFront|aadhaarBack|license|rc>, file=<photo>. Stored privately. */
export const POST = api({ roles: ["RIDER"], rateLimit: { name: "kyc-upload", limit: 20 } }, async ({ req, user }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest("Expected multipart/form-data");
  const doc = String(form.get("doc") ?? "") as KycDoc;
  const file = form.get("file");
  if (!(KYC_DOCS as readonly string[]).includes(doc)) throw badRequest("Unknown document");
  if (!(file instanceof File)) throw badRequest("No file uploaded");
  return saveKycDocument(user, doc, file);
});
