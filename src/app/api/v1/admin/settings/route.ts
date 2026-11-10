import { z } from "zod";
import { api } from "@/server/http";
import { getSettings, SETTINGS_GROUPS, updateSettingsGroup, type SettingsGroup } from "@/server/services/settings";
import { audit } from "@/server/services/audit";
import { integrationModes } from "@/server/env";

export const GET = api({ roles: ["SUPER_ADMIN"] }, async () => ({ settings: await getSettings(true), integrations: integrationModes() }));

export const PATCH = api(
  {
    roles: ["SUPER_ADMIN"],
    body: z.object({ group: z.enum(SETTINGS_GROUPS as [SettingsGroup, ...SettingsGroup[]]), values: z.record(z.string(), z.unknown()) }),
  },
  async ({ user, body }) => {
    const before = (await getSettings(true))[body.group];
    const updated = await updateSettingsGroup(body.group, body.values as never, user.id);
    await audit({ id: user.id, role: user.role }, "settings.update", "Setting", body.group, { before, after: updated });
    return { group: body.group, values: updated };
  },
);
