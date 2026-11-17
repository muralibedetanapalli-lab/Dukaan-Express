import { z } from "zod";
import { api } from "@/server/http";
import { setOnline } from "@/server/services/rider";

/** Rider goes online (receives job alerts) or offline. */
export const PATCH = api({ roles: ["RIDER"], body: z.object({ online: z.boolean() }) }, async ({ user, body }) => setOnline(user, body.online));
