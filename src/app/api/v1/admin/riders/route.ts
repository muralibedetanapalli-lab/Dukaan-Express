import { api } from "@/server/http";
import { createRider, zRiderInput } from "@/server/services/rider";

export const POST = api({ roles: ["SUPER_ADMIN"], body: zRiderInput }, async ({ user, body }) => createRider(user, body));
