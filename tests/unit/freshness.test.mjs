/**
 * §5 / §27 — the freshness ladder and source health.
 *
 * The single rule this file exists to protect: MEDIPAL never describes a figure
 * as "live" because MEDIPAL just wrote it. Only the SOURCE's own observation
 * time can earn the word LIVE, and a figure with no observation time is
 * UNKNOWN rather than fresh.
 *
 * Every assertion passes an explicit `now`, so the tests are deterministic and
 * cannot flake at a threshold boundary.
 */

import "./../helpers/env.mjs";

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  FRESHNESS_LEVELS,
  computeFreshnessLevel,
  freshnessCopy,
  describeFreshness,
  computeSourceHealth,
  isConfirmedAvailability,
} from "../../server/blood/freshness.mjs";

// Mirrors the pinned env in tests/helpers/env.mjs (30 / 120 / 360 minutes).
const THRESHOLDS = { live: 30, recent: 120, stale: 360 };

/** An ISO timestamp exactly `minutes` before `now`. */
const before = (now, minutes) => new Date(now - minutes * 60_000).toISOString();
const NOW = Date.parse("2026-02-01T12:00:00.000Z");

describe("freshness ladder (§5)", () => {
  it("orders the levels from freshest to least trustworthy", () => {
    assert.deepEqual(FRESHNESS_LEVELS, ["LIVE", "RECENT", "STALE", "OUTDATED", "UNKNOWN"]);
  });

  it("marks a just-observed figure LIVE", () => {
    assert.equal(computeFreshnessLevel(before(NOW, 0), THRESHOLDS, NOW), "LIVE");
    assert.equal(computeFreshnessLevel(before(NOW, 29), THRESHOLDS, NOW), "LIVE");
  });

  it("treats the LIVE upper boundary as inclusive and the next minute as RECENT", () => {
    assert.equal(computeFreshnessLevel(before(NOW, 30), THRESHOLDS, NOW), "LIVE");
    assert.equal(computeFreshnessLevel(before(NOW, 31), THRESHOLDS, NOW), "RECENT");
  });

  it("treats the RECENT upper boundary as inclusive and the next minute as STALE", () => {
    assert.equal(computeFreshnessLevel(before(NOW, 120), THRESHOLDS, NOW), "RECENT");
    assert.equal(computeFreshnessLevel(before(NOW, 121), THRESHOLDS, NOW), "STALE");
  });

  it("treats the STALE upper boundary as inclusive and beyond it as OUTDATED", () => {
    assert.equal(computeFreshnessLevel(before(NOW, 360), THRESHOLDS, NOW), "STALE");
    assert.equal(computeFreshnessLevel(before(NOW, 361), THRESHOLDS, NOW), "OUTDATED");
    assert.equal(computeFreshnessLevel(before(NOW, 60 * 24), THRESHOLDS, NOW), "OUTDATED");
  });

  it("returns UNKNOWN when the source supplied no observation time", () => {
    assert.equal(computeFreshnessLevel(null, THRESHOLDS, NOW), "UNKNOWN");
    assert.equal(computeFreshnessLevel(undefined, THRESHOLDS, NOW), "UNKNOWN");
    assert.equal(computeFreshnessLevel("", THRESHOLDS, NOW), "UNKNOWN");
  });

  it("returns UNKNOWN for an unparseable observation time rather than guessing", () => {
    assert.equal(computeFreshnessLevel("not-a-date", THRESHOLDS, NOW), "UNKNOWN");
  });

  it("treats a small clock skew as LIVE but a large one as UNKNOWN", () => {
    // A source clock a few minutes ahead is skew, not a future observation.
    assert.equal(computeFreshnessLevel(new Date(NOW + 5 * 60_000).toISOString(), THRESHOLDS, NOW), "LIVE");
    // Far in the future is nonsense and must not be dressed up as fresh.
    assert.equal(computeFreshnessLevel(new Date(NOW + 60 * 60_000).toISOString(), THRESHOLDS, NOW), "UNKNOWN");
  });

  it("honours operator-supplied thresholds instead of the defaults", () => {
    const tight = { live: 5, recent: 10, stale: 20 };
    assert.equal(computeFreshnessLevel(before(NOW, 6), tight, NOW), "RECENT");
    assert.equal(computeFreshnessLevel(before(NOW, 6), THRESHOLDS, NOW), "LIVE");
  });
});

describe("freshness copy (§15, §28)", () => {
  it("gives every level a human label and an explanation", () => {
    for (const level of FRESHNESS_LEVELS) {
      const copy = freshnessCopy(level);
      assert.equal(typeof copy.label, "string");
      assert.ok(copy.label.length > 0);
      assert.ok(copy.explanation.length > 0);
    }
  });

  it("warns that an OUTDATED figure is not confirmed stock", () => {
    assert.match(freshnessCopy("OUTDATED").explanation, /more than six hours old/i);
  });

  it("bundle returned by describeFreshness matches freshnessCopy", () => {
    const described = describeFreshness(before(NOW, 10), THRESHOLDS, NOW);
    assert.equal(described.level, "LIVE");
    assert.equal(described.label, freshnessCopy("LIVE").label);
    assert.deepEqual(described.thresholdsMinutes, THRESHOLDS);
  });
});

describe("confirmed availability (§16, §28)", () => {
  it("only LIVE and RECENT may be presented as confirmed stock", () => {
    assert.equal(isConfirmedAvailability("LIVE"), true);
    assert.equal(isConfirmedAvailability("RECENT"), true);
    assert.equal(isConfirmedAvailability("STALE"), false);
    assert.equal(isConfirmedAvailability("OUTDATED"), false);
    assert.equal(isConfirmedAvailability("UNKNOWN"), false);
  });
});

describe("source health (§26)", () => {
  it("reports not_configured when the operator has not supplied credentials", () => {
    assert.equal(computeSourceHealth({ enabled: true, configured: false }, NOW), "not_configured");
  });

  it("reports not_configured when the source is switched off", () => {
    assert.equal(computeSourceHealth({ enabled: false, configured: true }, NOW), "not_configured");
  });

  it("reports unknown when enabled but never probed", () => {
    assert.equal(computeSourceHealth({ enabled: true, configured: true }, NOW), "unknown");
  });

  it("reports degraded when enabled, never succeeded, and already failing", () => {
    const health = computeSourceHealth(
      { enabled: true, configured: true, lastFailedSync: before(NOW, 5) },
      NOW,
    );
    assert.equal(health, "degraded");
  });

  it("reports healthy while the last success is inside the degraded window", () => {
    const health = computeSourceHealth(
      { enabled: true, configured: true, lastSuccessfulSync: before(NOW, 30) },
      NOW,
    );
    assert.equal(health, "healthy");
  });

  it("degrades once the last success ages past the degraded threshold", () => {
    const health = computeSourceHealth(
      { enabled: true, configured: true, lastSuccessfulSync: before(NOW, 120) },
      NOW,
    );
    assert.equal(health, "degraded");
  });

  it("goes offline once the last success ages past the offline threshold", () => {
    const health = computeSourceHealth(
      { enabled: true, configured: true, lastSuccessfulSync: before(NOW, 500) },
      NOW,
    );
    assert.equal(health, "offline");
  });
});
