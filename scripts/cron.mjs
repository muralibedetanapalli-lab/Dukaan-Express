// Scheduled maintenance trigger (Azure Container Apps Job / any scheduler).
// Calls the app's protected maintenance endpoint and exits non-zero on failure so the job shows as Failed.
const url = `${process.env.APP_URL}/api/v1/cron/maintenance`;
const res = await fetch(url, {
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  signal: AbortSignal.timeout(90_000),
}).catch((e) => {
  console.error("maintenance request failed:", e.message);
  process.exit(1);
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
