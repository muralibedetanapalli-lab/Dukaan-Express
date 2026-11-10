import { api } from "@/server/http";
import { db } from "@/server/db";
import { integrationModes } from "@/server/env";

export const GET = api({}, async () => {
  await db.$queryRaw`SELECT 1`;
  return { status: "ok", time: new Date().toISOString(), integrations: integrationModes() };
});
