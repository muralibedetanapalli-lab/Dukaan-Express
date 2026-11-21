import { api } from "@/server/http";
import { sendAgreementCode } from "@/server/services/agreement";

/** Public: email a one-time code to the address the agreement was sent to. The token in the link is the credential. */
export const POST = api({ rateLimit: { name: "agreement-code", limit: 5 } }, async ({ params }) => sendAgreementCode(params.token));
