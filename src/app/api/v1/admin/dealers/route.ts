import { api } from "@/server/http";
import { createDealer, zDealerInput } from "@/server/services/dealer";

/** Create a regional dealer (login + regions + commission share). */
export const POST = api({ roles: ["SUPER_ADMIN"], body: zDealerInput }, async ({ user, body }) => createDealer(user, body));
