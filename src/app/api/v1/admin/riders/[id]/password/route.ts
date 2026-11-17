import { api } from "@/server/http";
import { resetRiderPassword } from "@/server/services/rider";

export const POST = api({ roles: ["SUPER_ADMIN"] }, async ({ user, params }) => resetRiderPassword(user, params.id));
