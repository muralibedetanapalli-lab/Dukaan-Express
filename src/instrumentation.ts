/**
 * Runs once when the Next.js server starts.
 *
 * In-process maintenance: while the app is awake it calls its own maintenance endpoint shortly after
 * start-up and then every few minutes. With Azure scale-to-zero (min replicas 0) the app only runs when
 * someone uses it, so pending work (unpaid-order expiry, shop accept timeouts, missed refunds, stuck
 * shipments) is handled as soon as anyone visits — without an external job waking the app every 15 minutes.
 * The call goes to localhost, so it never counts as traffic that keeps the replica alive.
 *
 * Enabled in production when CRON_SECRET is set; set IN_PROCESS_MAINTENANCE=false to turn it off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production" || process.env.IN_PROCESS_MAINTENANCE === "false") return;
  const secret = process.env.CRON_SECRET;
  if (!secret) return;

  const url = `http://127.0.0.1:${process.env.PORT || 3000}/api/v1/cron/maintenance`;
  const FIRST_RUN_MS = 20_000; // let the server finish starting
  const EVERY_MS = 5 * 60_000;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(90_000) });
      const body = await res.text();
      if (!res.ok) console.warn(`[maintenance] ${res.status} ${body.slice(0, 200)}`);
      else if (!/"expired":0,"refundsSettled":0,"autoRejected":0,"reconciled":0/.test(body)) console.info(`[maintenance] ${body.slice(0, 300)}`);
    } catch (e) {
      console.warn("[maintenance] failed:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };

  setTimeout(run, FIRST_RUN_MS).unref();
  setInterval(run, EVERY_MS).unref();
}
