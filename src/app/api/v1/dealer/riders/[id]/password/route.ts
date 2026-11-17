import { api } from "@/server/http";
import { resetRiderPassword } from "@/server/services/rider";

export const POST = api({ roles: ["DEALER"] }, async ({ user, params }) => resetRiderPassword(user, params.id));
