import { api } from "@/server/http";
import { db } from "@/server/db";
import { zBanner } from "@/server/validators-admin";

export const GET = api({ roles: ["SUPER_ADMIN"] }, async () => ({ banners: await db.banner.findMany({ orderBy: { sortOrder: "asc" } }) }));

export const POST = api({ roles: ["SUPER_ADMIN"], body: zBanner }, async ({ body }) => db.banner.create({ data: body }));
