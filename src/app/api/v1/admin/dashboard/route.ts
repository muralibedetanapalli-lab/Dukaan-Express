import { z } from "zod";
import { api } from "@/server/http";
import { adminDashboard, salesSeries } from "@/server/services/dashboard";

export const GET = api(
  { roles: ["SUPER_ADMIN"], query: z.object({ granularity: z.enum(["daily", "weekly", "monthly"]).default("daily") }) },
  async ({ query }) => {
    const [stats, series] = await Promise.all([adminDashboard(), salesSeries(query.granularity)]);
    return { stats, series };
  },
);
