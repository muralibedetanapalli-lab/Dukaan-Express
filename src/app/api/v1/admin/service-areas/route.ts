import { api } from "@/server/http";
import { db } from "@/server/db";
import { zServiceArea } from "@/server/validators-admin";

export const GET = api({ roles: ["SUPER_ADMIN"] }, async () => ({ areas: await db.serviceArea.findMany({ orderBy: { city: "asc" } }) }));

export const POST = api({ roles: ["SUPER_ADMIN"], body: zServiceArea }, async ({ body }) => db.serviceArea.create({ data: body }));
