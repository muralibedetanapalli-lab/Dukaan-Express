import { api } from "@/server/http";
import { agreementPdfFor, resendAgreement } from "@/server/services/agreement";

const roles: ("SUPER_ADMIN" | "DEALER" | "SHOP_OWNER")[] = ["SUPER_ADMIN", "DEALER", "SHOP_OWNER"];

/** Download the shop's agreement (signed copy when signed). Admin, the shop's dealer or its owner. */
export const GET = api({ roles, raw: true }, async ({ user, params }) => {
  const { pdf, filename } = await agreementPdfFor(user, params.shopId);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});

/** Email the agreement again with a fresh link (the previous link stops working). */
export const POST = api({ roles, rateLimit: { name: "agreement-resend", limit: 5 } }, async ({ user, params }) => resendAgreement(user, params.shopId));
