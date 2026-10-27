/**
 * Deterministic environment for the test run.
 *
 * `server/env.mjs` lets the ambient process environment win over `.env.server`,
 * so pinning these values here makes the suite reproducible on every machine:
 * a developer's local thresholds can never change whether a test passes.
 *
 * This module must be imported BEFORE any `server/` module. ES modules evaluate
 * their imports in declaration order, so listing it first in a test file is
 * enough — `config` is then built from exactly these values.
 *
 * Nothing here contains a credential: every provider value is deliberately
 * empty, which is how the suite proves that an unconfigured source is reported
 * as `not_configured` instead of being invented.
 */

process.env.BLOOD_PROVIDER_ATTEMPTS ??= "3";
// 50 ms is the floor `server/env.mjs` enforces for this key — anything lower is
// rejected and falls back to the 700 ms default, which would make the retry
// tests sleep for seconds for no reason.
process.env.BLOOD_PROVIDER_BACKOFF_MS ??= "50";
process.env.BLOOD_PROVIDER_TIMEOUT_MS ??= "1500";

// A deliberately fake platform-admin key for the authorization tests. It is not
// a credential — no deployment should ever use it — and pinning it here keeps
// the admin path testable regardless of what a developer has in `.env.server`.
process.env.BLOOD_ADMIN_KEY ??= "medipal-test-admin-key-not-a-secret";

process.env.BLOOD_LIVE_THRESHOLD_MINUTES ??= "30";
process.env.BLOOD_RECENT_THRESHOLD_MINUTES ??= "120";
process.env.BLOOD_STALE_THRESHOLD_MINUTES ??= "360";
process.env.BLOOD_PROVIDER_DEGRADED_MINUTES ??= "60";
process.env.BLOOD_PROVIDER_OFFLINE_MINUTES ??= "360";

// No authorised e-RaktKosh feed exists in a test run. These are blanked rather
// than trusted from `.env.server` so the "not configured" contract is tested.
process.env.ERAKTKOSH_API_BASE_URL = "";
process.env.ERAKTKOSH_API_KEY = "";
process.env.ERAKTKOSH_API_SECRET = "";
process.env.ERAKTKOSH_CENTRES_PATH = "";
process.env.ERAKTKOSH_AVAILABILITY_PATH = "";
process.env.ERAKTKOSH_DISTRICTS_PATH = "";
