import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { integrationModes } from "@/server/env";
import { PageHeader } from "@/components/shared/misc";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, areas] = await Promise.all([getSettings(true), db.serviceArea.findMany({ orderBy: { city: "asc" } })]);
  return (
    <div>
      <PageHeader title="Platform settings" description="Every change is validated on the server and recorded in the audit log" />
      <SettingsClient
        settings={settings}
        integrations={integrationModes()}
        areas={areas.map((a) => ({ id: a.id, city: a.city, state: a.state, isActive: a.isActive, pincodes: a.pincodes, centerLat: a.centerLat, centerLng: a.centerLng, radiusKm: a.radiusKm, localities: a.localities as { name: string; lat: number; lng: number; pincode: string }[] }))}
      />
    </div>
  );
}
