/**
 * Database helpers for the integration suite.
 *
 * Two rules keep this safe to run against a real development database:
 *
 *   1. SCHEMA PROBES NEVER COMMIT. Invariant tests run inside `withRollback`,
 *      which always rolls back — a provoked constraint violation leaves nothing
 *      behind.
 *   2. ROUTE FIXTURES ARE SYNTHETIC, LABELLED, AND REMOVED. The live-availability
 *      routes read through the connection pool, so their fixtures must be
 *      committed to be visible. Every one of them is therefore named with a
 *      `TEST FIXTURE` prefix and a `TESTFIX:` external id, and `removeFixture`
 *      deletes the centre, which cascades to its inventory and history.
 *
 * No fixture ever represents real blood stock: the numbers exist only for the
 * duration of a test and are labelled as fabricated in their own source_note.
 * When `DATABASE_URL` is unset the whole integration suite is skipped with an
 * explicit reason rather than silently passing.
 */

import { randomUUID } from "node:crypto";
import { config } from "../../server/env.mjs";
import { query } from "../../server/db.mjs";

export const dbConfigured = Boolean(config.database.url);

/** The provenance id a synthetic centre is filed under. Never e-RaktKosh. */
export const FIXTURE_SOURCE_ID = "blood_centre_verified";

export const FIXTURE_PREFIX = "TESTFIX";

/** A unique-per-run marker, so two test runs can never collide. */
export function newMarker() {
  return `${FIXTURE_PREFIX}:${randomUUID()}`;
}

/**
 * Commits one synthetic, approved blood centre with two inventory rows:
 *
 *   · O+ / Platelets, 7 units, observed 2 minutes ago  -> must read LIVE
 *   · A+ / Whole Blood, 3 units, observed 9 hours ago  -> must read OUTDATED
 *
 * The second row is the important one: it proves a figure the source has not
 * restated is kept and honestly aged, never deleted and never shown as "live".
 */
export async function createFixture() {
  const marker = newMarker();
  const facility = await query(
    `insert into blood_facilities
       (name, category, address, city, district, state, postal_code, latitude, longitude, phone,
        license_number, status, has_blood_bank, data_source_id, source_note,
        verification_status, external_id, last_verified_at)
     values ($1, 'Hospital Blood Bank', $2, 'Patna', 'Patna', 'Bihar', '800001', 25.5941, 85.1376, null,
             $3, 'approved', true, $4, $5,
             'centre_verified', $6, now())
     returning id, public_ref`,
    [
      "TEST FIXTURE — synthetic blood centre (MEDIPAL test suite)",
      "Created only for an automated test run and deleted when it finishes.",
      `TEST-LICENCE-${marker.slice(-8)}`,
      FIXTURE_SOURCE_ID,
      "Synthetic row created by the MEDIPAL test suite. It does not describe a real centre and is removed on completion.",
      marker,
    ],
  );

  const facilityId = facility.rows[0].id;
  const facilityRef = facility.rows[0].public_ref;

  await query(
    `insert into blood_inventory
       (facility_id, blood_group, component, quantity, unit, status, notes, reported_by,
        data_source_id, availability_status, source_updated_at, synced_at, last_updated_at)
     values
       ($1, 'O+', 'Platelets', 7, 'Units', 'available', $2, 'test-fixture',
        $3, 'AVAILABLE', now() - interval '2 minutes', now(), now() - interval '2 minutes'),
       ($1, 'A+', 'Whole Blood', 3, 'Units', 'available', $2, 'test-fixture',
        $3, 'LOW', now() - interval '9 hours', now() - interval '9 hours', now() - interval '9 hours')`,
    [facilityId, "Synthetic fixture row created by the MEDIPAL test suite.", FIXTURE_SOURCE_ID],
  );

  return { facilityId, facilityRef, marker };
}

/**
 * Commits one synthetic, approved centre that has reported NO inventory at all.
 *
 * This is the honesty fixture: a centre existing is not evidence that it holds
 * blood, so every surface must render its stock block as "no report received"
 * rather than as zero units or as unavailable.
 */
export async function createBareCentre() {
  const marker = newMarker();
  const facility = await query(
    `insert into blood_facilities
       (name, category, address, city, district, state, postal_code, latitude, longitude, phone,
        license_number, status, has_blood_bank, data_source_id, source_note,
        verification_status, external_id, last_verified_at)
     values ($1, 'Regional Blood Center', $2, 'Patna', 'Patna', 'Bihar', '800001', 25.6100, 85.1400, null,
             $3, 'approved', true, $4, $5,
             'unverified', $6, now())
     returning id, public_ref`,
    [
      "TEST FIXTURE — synthetic centre with no reported stock (MEDIPAL test suite)",
      "Created only for an automated test run and deleted when it finishes.",
      `TEST-LICENCE-${marker.slice(-8)}`,
      FIXTURE_SOURCE_ID,
      "Synthetic row created by the MEDIPAL test suite. It reports no stock, on purpose. Removed on completion.",
      marker,
    ],
  );

  return { facilityId: facility.rows[0].id, facilityRef: facility.rows[0].public_ref, marker };
}

/** Removes the fixture and everything that cascades from it. Idempotent. */
export async function removeFixture(fixture) {
  if (!fixture?.facilityId) return;
  await query("delete from blood_facilities where id = $1", [fixture.facilityId]);
}

/** Deletes one sync run and its errors. Used to undo a test-triggered run. */
export async function removeSyncRun(runId) {
  if (!runId) return;
  await query("delete from sync_runs where id = $1", [runId]);
}

/** A promise that rejects — used to assert invariants that must NOT hold. */
export async function expectFailure(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the statement to fail, but it succeeded. A safety invariant is missing.");
}
