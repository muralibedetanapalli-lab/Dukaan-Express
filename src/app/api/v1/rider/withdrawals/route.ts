import { z } from "zod";
import { api } from "@/server/http";
import { requestWithdrawal } from "@/server/services/rider";

/** Withdraw wallet money (the whole balance unless an amount in paise is given). */
export const POST = api({ roles: ["RIDER"], body: z.object({ amount: z.number().int().positive().optional() }) }, async ({ user, body }) =>
  requestWithdrawal(user, body.amount),
);
