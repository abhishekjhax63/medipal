/**
 * Freshness, computed on the server from the SOURCE's own observation time.
 *
 * The whole point of this module is that a stock figure is never described as
 * "live" merely because MEDIPAL just wrote it. Our own `synced_at` says when we
 * copied a number; `source_updated_at` says when the blood centre itself last
 * observed it, and only that can justify the word LIVE.
 *
 * Thresholds come from the environment (`BLOOD_LIVE_THRESHOLD_MINUTES`, etc.),
 * so an operator can tighten or loosen the ladder without a code change. The
 * defaults are 0-30 min LIVE, 30-120 RECENT, 120-360 STALE, 360+ OUTDATED.
 */

import { config } from "../env.mjs";

export const FRESHNESS_LEVELS = Object.freeze(["LIVE", "RECENT", "STALE", "OUTDATED", "UNKNOWN"]);

export const FRESHNESS_THRESHOLDS = Object.freeze({
  live: config.blood.liveThresholdMinutes,
  recent: config.blood.recentThresholdMinutes,
  stale: config.blood.staleThresholdMinutes,
});

/**
 * The freshness level for one inventory figure.
 *
 * UNKNOWN is a first-class answer: a provider row with no source timestamp is
 * exactly that, and the interface must be able to say "we cannot date this"
 * rather than pretending it is fresh.
 */
export function computeFreshnessLevel(sourceUpdatedAt, thresholds = FRESHNESS_THRESHOLDS, now = Date.now()) {
  if (!sourceUpdatedAt) return "UNKNOWN";
  const observed = new Date(sourceUpdatedAt).getTime();
  if (!Number.isFinite(observed)) return "UNKNOWN";

  const minutes = (now - observed) / 60_000;
  // A timestamp slightly ahead of us is clock skew, not a future observation.
  if (minutes < 0) return minutes > -15 ? "LIVE" : "UNKNOWN";
  if (minutes <= thresholds.live) return "LIVE";
  if (minutes <= thresholds.recent) return "RECENT";
  if (minutes <= thresholds.stale) return "STALE";
  return "OUTDATED";
}

/**
 * The human-facing copy for each level. Kept next to the computation so the
 * label and the rule can never drift apart.
 */
export function freshnessCopy(level) {
  switch (level) {
    case "LIVE":
      return {
        label: "Live",
        explanation: "The blood centre reported this within the last 30 minutes.",
      };
    case "RECENT":
      return {
        label: "Recent",
        explanation:
          "Reported in the last few hours. Very likely still accurate, but not confirmed this minute.",
      };
    case "STALE":
      return {
        label: "Possibly stale",
        explanation:
          "This observation is several hours old. Call the blood centre before relying on it.",
      };
    case "OUTDATED":
      return {
        label: "Outdated",
        explanation:
          "This figure is more than six hours old. It is shown for completeness only and must not be treated as confirmed stock.",
      };
    default:
      return {
        label: "Not dated",
        explanation:
          "No reliable observation time was supplied, so MEDIPAL cannot say how current this is.",
      };
  }
}

/** Convenience bundle the API hands to the UI. */
export function describeFreshness(sourceUpdatedAt, thresholds = FRESHNESS_THRESHOLDS, now = Date.now()) {
  const level = computeFreshnessLevel(sourceUpdatedAt, thresholds, now);
  const { label, explanation } = freshnessCopy(level);
  return { level, label, explanation, thresholdsMinutes: thresholds };
}

/**
 * The health of a data source, derived from when it last succeeded. This is
 * what turns "we have not heard from e-RaktKosh for six hours" into a visible
 * DEGRADED/OFFLINE badge instead of a silent gap in the numbers.
 */
export function computeSourceHealth(
  { enabled = false, configured = false, lastSuccessfulSync = null, lastFailedSync = null },
  now = Date.now(),
) {
  if (configured === false) return "not_configured";
  if (!enabled) return "not_configured";

  const lastOk = lastSuccessfulSync ? new Date(lastSuccessfulSync).getTime() : NaN;
  if (!Number.isFinite(lastOk)) {
    // Enabled but never succeeded. If it has failed, that is a real signal.
    return lastFailedSync ? "degraded" : "unknown";
  }

  const minutesSince = (now - lastOk) / 60_000;
  if (minutesSince <= config.blood.providerDegradedMinutes) return "healthy";
  if (minutesSince <= config.blood.providerOfflineMinutes) return "degraded";
  return "offline";
}

/**
 * Whether a freshness level may be presented as confirmed stock. Emergency
 * ranking uses this so stale or undated rows are never shown as "available".
 */
export function isConfirmedAvailability(level) {
  return level === "LIVE" || level === "RECENT";
}
