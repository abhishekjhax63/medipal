/**
 * §4 / §7 / §8 / §27 — the database invariants the sync pipeline relies on.
 *
 * These are the guarantees that make an automated, every-15-minutes writer safe:
 * a re-run must update rather than duplicate, two cron ticks must never
 * interleave, and a centre or a stock figure must never be storable in a state
 * that misrepresents it.
 *
 * Every probe runs inside `withRollback`, which ALWAYS rolls back, so provoking
 * a constraint violation here leaves not one row behind.
 */

import "./../helpers/env.mjs";

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

import { dbConfigured, query, withRollback, closePool } from "../../server/db.mjs";
import { expectFailure } from "../helpers/db.mjs";

after(async () => {
  await closePool();
});

const NO_DATABASE = "DATABASE_URL is not configured — the schema integration suite needs a database.";

/** Runs `fn` under a savepoint so one failed probe cannot poison the next. */
async function probe(client, fn) {
  await client.query("savepoint probe");
  try {
    return await fn();
  } finally {
    await client.query("rollback to savepoint probe");
  }
}

/** An approved, minimal facility, used as an anchor for inventory probes. */
function insertAnchor(client, extra = {}) {
  return client.query(
    `insert into blood_facilities (name, category, city, state, data_source_id, external_id)
     values ('Schema probe centre', 'Hospital Blood Bank', 'Patna', 'Bihar', 'blood_centre_verified', $1)
     returning id`,
    [extra.externalId ?? null],
  );
}

describe("districts are a complete, trustworthy geography (§1)", { skip: dbConfigured ? false : NO_DATABASE }, () => {
  it("seeds every Bihar district with a usable headquarters coordinate", async () => {
    const result = await query("select name, latitude, longitude from districts where state = 'Bihar'");
    assert.equal(result.rowCount, 38, "Bihar has 38 districts");
    const names = new Set(result.rows.map((row) => row.name));
    for (const required of ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur", "East Champaran", "West Champaran"]) {
      assert.ok(names.has(required), `${required} must be present`);
    }
    for (const row of result.rows) {
      assert.ok(row.latitude >= -90 && row.latitude <= 90, `${row.name} latitude in range`);
      assert.ok(row.longitude >= -180 && row.longitude <= 180, `${row.name} longitude in range`);
    }
  });

  it("refuses a district coordinate outside the valid range", async () => {
    const error = await withRollback((client) =>
      probe(client, () =>
        expectFailure(
          client.query(
            `insert into districts (name, state, latitude, longitude)
             values ('Probe District', 'Bihar', 91.5, 85.0)`,
          ),
        ),
      ),
    );
    assert.equal(error.constraint, "districts_coordinate_range");
  });
});

describe("idempotency keys prevent duplicates (§7, §27)", { skip: dbConfigured ? false : NO_DATABASE }, () => {
  it("a centre cannot be stored twice under the same source + external id", async () => {
    const error = await withRollback((client) =>
      probe(client, async () => {
        await insertAnchor(client, { externalId: "TESTFIX:DUP-CENTRE" });
        return expectFailure(insertAnchor(client, { externalId: "TESTFIX:DUP-CENTRE" }));
      }),
    );
    assert.equal(error.code, "23505");
    assert.equal(error.constraint, "blood_facilities_source_external_idx");
  });

  it("a provider figure cannot be stored twice for the same centre/group/component", async () => {
    const error = await withRollback((client) =>
      probe(client, async () => {
        const anchor = await insertAnchor(client);
        const insert = (recordId) =>
          client.query(
            `insert into blood_inventory
               (facility_id, blood_group, component, quantity, data_source_id, source_record_id)
             values ($1, 'O+', 'Platelets', 5, 'blood_centre_verified', $2)`,
            [anchor.rows[0].id, recordId],
          );
        await insert("TESTFIX:A:O+:Platelets");
        return expectFailure(insert("TESTFIX:A:O+:Platelets"));
      }),
    );
    assert.equal(error.code, "23505");
    assert.equal(error.constraint, "blood_inventory_sync_grain_idx");
  });

  it("allows a manual row alongside a provider row for the same grain", async () => {
    // The unique index is partial (`where source_record_id is not null`), so a
    // facility's own manually-entered stock is not collided with by a provider
    // figure. Both remain visible and are ranked by source priority instead.
    const ids = await withRollback((client) =>
      probe(client, async () => {
        const anchor = await insertAnchor(client);
        const manual = await client.query(
          `insert into blood_inventory (facility_id, blood_group, component, quantity, data_source_id)
           values ($1, 'O+', 'Platelets', 2, 'facility_self_report') returning id`,
          [anchor.rows[0].id],
        );
        const provider = await client.query(
          `insert into blood_inventory
             (facility_id, blood_group, component, quantity, data_source_id, source_record_id)
           values ($1, 'O+', 'Platelets', 5, 'blood_centre_verified', 'TESTFIX:MIX') returning id`,
          [anchor.rows[0].id],
        );
        return [manual.rows[0].id, provider.rows[0].id];
      }),
    );
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
  });
});

describe("one sync per source at a time (§6, §27)", { skip: dbConfigured ? false : NO_DATABASE }, () => {
  it("refuses a second in-flight run for the same provider", async () => {
    const error = await withRollback((client) =>
      probe(client, async () => {
        await client.query(
          `insert into sync_runs (provider, trigger, status)
           values ('eraktkosh_authorized_feed', 'schedule', 'running')`,
        );
        return expectFailure(
          client.query(
            `insert into sync_runs (provider, trigger, status)
             values ('eraktkosh_authorized_feed', 'schedule', 'running')`,
          ),
        );
      }),
    );
    assert.equal(error.code, "23505");
    assert.equal(error.constraint, "sync_runs_single_active_idx");
  });

  it("allows a new run once the previous one has completed", async () => {
    await withRollback((client) =>
      probe(client, async () => {
        await client.query(
          `insert into sync_runs (provider, trigger, status, completed_at)
           values ('eraktkosh_authorized_feed', 'schedule', 'success', now())`,
        );
        await client.query(
          `insert into sync_runs (provider, trigger, status)
           values ('eraktkosh_authorized_feed', 'schedule', 'running')`,
        );
      }),
    );
  });

  it("refuses a run that completed before it started", async () => {
    const error = await withRollback((client) =>
      probe(client, () =>
        expectFailure(
          client.query(
            `insert into sync_runs (provider, trigger, status, started_at, completed_at)
             values ('eraktkosh_authorized_feed', 'schedule', 'success', now(), now() - interval '1 hour')`,
          ),
        ),
      ),
    );
    assert.equal(error.constraint, "sync_runs_completion_order");
  });
});

describe("a centre cannot be published without provenance (§8)", { skip: dbConfigured ? false : NO_DATABASE }, () => {
  it("refuses approval for an unlicensed, unverified centre", async () => {
    const error = await withRollback((client) =>
      probe(client, async () => {
        const anchor = await insertAnchor(client);
        return expectFailure(
          client.query("update blood_facilities set status = 'approved' where id = $1", [anchor.rows[0].id]),
        );
      }),
    );
    assert.equal(error.constraint, "blood_facilities_status_gate");
  });

  it("allows approval of a provider-authorised centre that carries an external id", async () => {
    await withRollback((client) =>
      probe(client, async () => {
        const anchor = await insertAnchor(client);
        await client.query(
          `update blood_facilities
              set verification_status = 'provider_authorized',
                  external_id = 'TESTFIX:GATE-OK',
                  last_verified_at = now(),
                  status = 'approved'
            where id = $1`,
          [anchor.rows[0].id],
        );
        const check = await client.query("select status from blood_facilities where id = $1", [
          anchor.rows[0].id,
        ]);
        assert.equal(check.rows[0].status, "approved");
      }),
    );
  });
});
