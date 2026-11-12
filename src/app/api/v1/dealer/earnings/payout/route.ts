import { api } from "@/server/http";
import { requestDealerPayout } from "@/server/services/dealer";

/** Dealer requests their available commission share. */
export const POST = api({ roles: ["DEALER"] }, async ({ user }) => requestDealerPayout(user));
