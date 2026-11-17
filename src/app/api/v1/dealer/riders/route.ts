import { api } from "@/server/http";
import { createRider, zRiderInput } from "@/server/services/rider";

/** Dealer onboards a rider (login + vehicle). */
export const POST = api({ roles: ["DEALER"], body: zRiderInput, rateLimit: { name: "rider-create", limit: 30 } }, async ({ user, body }) =>
  createRider(user, { ...body, dealerId: null }),
);
