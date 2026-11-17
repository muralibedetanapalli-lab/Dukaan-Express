import { api } from "@/server/http";
import { riderSignupAreas } from "@/server/services/rider-kyc";

/** Areas a new rider can choose: service areas with at least one live shop. Public. */
export const GET = api({ rateLimit: { name: "rider-areas", limit: 60 } }, async () => ({ areas: await riderSignupAreas() }));
