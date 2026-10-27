/**
 * The scheduler that keeps Bihar availability fresh.
 *
 * Default cadence is every 15 minutes (`BLOOD_SYNC_INTERVAL_MINUTES`). It is a
 * plain interval rather than a cron dependency: the process is a single Node
 * server, and an interval is one fewer thing to misconfigure.
 *
 * Two properties are deliberate:
 *
 *   · OVERLAP IS IMPOSSIBLE. The tick sets a busy flag, and the database has
 *     `sync_runs_single_active_idx` as a second line of defence, so a slow run
 *     can never be joined by the next tick.
 *   · A SOURCE IS NEVER INVENTED. When nothing is configured the scheduler
 *     still ticks — so the admin console can show "enabled, awaiting
 *     credentials" — but it reads nothing and stores nothing.
 */

import { config } from "../env.mjs";
import { runScheduledSyncs } from "./sync.mjs";

let timer = null;
let busy = false;
let lastTickAt = null;
let lastResults = null;

async function tick(trigger) {
  if (busy) {
    console.log(`[medipal] blood sync tick skipped: a run is still in progress.`);
    return lastResults;
  }
  busy = true;
  lastTickAt = new Date().toISOString();
  try {
    const results = await runScheduledSyncs(trigger);
    lastResults = results;
    const touched = results.filter((result) => result?.records?.received > 0);
    if (touched.length > 0) {
      for (const result of touched) {
        console.log(
          `[medipal] blood sync ${result.provider}: ${result.status} received=${result.records.received} ` +
            `inserted=${result.records.inserted} updated=${result.records.updated} failed=${result.records.failed}`,
        );
      }
    }
    return results;
  } catch (error) {
    console.error(`[medipal] blood sync tick failed: ${error.message}`);
    return lastResults;
  } finally {
    busy = false;
  }
}

/** Starts the recurring sync. Safe to call once at process start. */
export function startScheduler() {
  if (timer) return;

  const intervalMs = config.blood.syncIntervalMinutes * 60_000;
  // A short delay lets the database pool and migrations settle before the first
  // read, and keeps startup latency unaffected.
  const startupDelayMs = 5_000;
  const startupTimer = setTimeout(() => void tick("startup"), startupDelayMs);
  startupTimer.unref?.();

  timer = setInterval(() => void tick("schedule"), intervalMs);
  timer.unref?.();

  console.log(
    `[medipal] blood availability sync scheduled every ${config.blood.syncIntervalMinutes} minute(s).`,
  );
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Runs a tick immediately — used by the admin "Run sync now" button. */
export function runTickNow() {
  return tick("manual");
}

export function schedulerStatus() {
  return {
    running: Boolean(timer),
    busy,
    intervalMinutes: config.blood.syncIntervalMinutes,
    lastTickAt,
    lastResults:
      lastResults?.map((result) => ({
        provider: result?.provider ?? null,
        status: result?.status ?? "unknown",
        message: result?.message ?? null,
      })) ?? null,
  };
}
