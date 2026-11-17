import { api } from "@/server/http";
import { availableJobs, requireRider } from "@/server/services/delivery";

/** Open deliveries near the rider. */
export const GET = api({ roles: ["RIDER"] }, async ({ user }) => ({ jobs: await availableJobs(requireRider(user)) }));
