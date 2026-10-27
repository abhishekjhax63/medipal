/**
 * The Bihar blood-availability sync orchestrator.
 *
 * This is the only place that writes provider data into the database, and it
 * follows the fifteen steps the specification sets out:
 *
 *   1  start a sync_run              9  upsert centres
 *   2  authenticate                  10 upsert inventory
 *   3  fetch centres                 11 detect changes
 *   4  fetch availability            12 age what was not restated
 *   5  validate                      13 record errors
 *   6  normalise blood group         14 complete the sync_run
 *   7  normalise component           15 update provider health
 *   8  match centres
 *
 * Two invariants matter more than anything else here:
 *
 *   · NOTHING IS DELETED WHEN A SOURCE GOES QUIET. If a provider stops
 *     responding the last successful figures stay exactly as they were; the
 *     freshness ladder, not a delete, is what tells the truth about their age.
 *   · A FIGURE IS NEVER INVENTED. A record that cannot be validated is
 *     rejected and written to `sync_errors` with the offending fields, so an
 *     administrator can see what the provider actually sent.
 */

import { config } from "../env.mjs";
import { HttpError } from "../http.mjs";
import { query, withTransaction, audit } from "../db.mjs";
import {
  ERROR_TYPES,
  normalizeCentreRecord,
  normalizeInventoryRecord,
  payloadHash,
  safeExcerpt,
} from "./normalize.mjs";
import { computeSourceHealth } from "./freshness.mjs";
import { getProvider, getProviders, getRunnableProviders } from "./providers/index.mjs";
import { ProviderError, PROVIDER_CODES } from "./providers/base.mjs";
import { broadcast } from "./live-hub.mjs";

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/** Every canonical Bihar district name, for normalising provider spellings. */
async function loadDistrictNames() {
  try {
    const result = await query("select name from districts where state = 'Bihar' order by name");
    return result.rows.map((row) => row.name);
  } catch {
    // Migration 006 has not been applied yet. Rejecting every district would be
    // worse than proceeding without the cross-check.
    return [];
  }
}

async function loadDistrictIndex() {
  try {
    const result = await query("select id, name from districts");
    return new Map(result.rows.map((row) => [row.name, row.id]));
  } catch {
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Step 1 — the run row, which also serialises concurrent runs
// ---------------------------------------------------------------------------

async function startRun(providerId, trigger) {
  try {
    const result = await query(
      `insert into sync_runs (provider, trigger, status)
       values ($1, $2, 'running')
       returning id, started_at`,
      [providerId, trigger],
    );
    return result.rows[0];
  } catch (error) {
    // `sync_runs_single_active_idx` is what makes this safe: two cron ticks can
    // never interleave writes for the same source.
    if (error?.code === "23505") {
      throw new HttpError(
        409,
        "A synchronisation for this source is already running. Wait for it to finish.",
        "SYNC_ALREADY_RUNNING",
      );
    }
    throw error;
  }
}

async function finishRun(runId, summary, status, message = null) {
  await query(
    `update sync_runs
        set status = $2,
            completed_at = now(),
            records_received  = $3,
            records_inserted  = $4,
            records_updated   = $5,
            records_unchanged = $6,
            records_failed    = $7,
            centres_upserted  = $8,
            request_attempts  = $9,
            duration_ms       = $10,
            error_message     = $11
      where id = $1`,
    [
      runId,
      status,
      summary.received,
      summary.inserted,
      summary.updated,
      summary.unchanged,
      summary.failed,
      summary.centresUpserted,
      summary.attempts,
      summary.durationMs,
      message,
    ],
  );
}

/** Short-circuits a run that had nothing to do, with an honest reason. */
async function skipRun(providerId, trigger, message, healthStatus) {
  const started = Date.now();
  const run = await startRun(providerId, trigger);
  await finishRun(
    run.id,
    { received: 0, inserted: 0, updated: 0, unchanged: 0, failed: 0, centresUpserted: 0, attempts: 0, durationMs: Date.now() - started },
    "skipped",
    message,
  );
  await updateSourceHealth(providerId, healthStatus, message);
  return {
    provider: providerId,
    runId: run.id,
    status: "skipped",
    message,
    records: { received: 0, inserted: 0, updated: 0, unchanged: 0, failed: 0, notRestated: 0 },
    centresUpserted: 0,
    durationMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// Step 15 — provider health
// ---------------------------------------------------------------------------

async function updateSourceHealth(providerId, healthStatus, message) {
  try {
    await query(
      `update blood_data_sources
          set health_status = $2,
              health_message = $3,
              last_health_check_at = now(),
              last_synced_at = case when $4 then now() else last_synced_at end,
              last_successful_sync = case when $4 then now() else last_successful_sync end,
              last_failed_sync = case when $5 then now() else last_failed_sync end
        where id = $1`,
      [providerId, healthStatus, message, healthStatus === "healthy", healthStatus === "degraded" || healthStatus === "offline"],
    );
  } catch (error) {
    console.error(`[medipal] could not update source health for ${providerId}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Steps 9-11 — writing centres and inventory
// ---------------------------------------------------------------------------

/**
 * Upserts every centre and resolves its database id. Provider records are
 * matched on `(data_source_id, external_id)` — the idempotency key — so a
 * re-run updates the same row instead of creating a duplicate centre.
 */
async function writeCentres(client, providerId, centres, districtNames, districtIndex, runId, errors) {
  const idByExternal = new Map();
  let upserted = 0;

  for (const record of centres) {
    const normalized = normalizeCentreRecord(record, { districtNames });
    if (!normalized.ok) {
      errors.push({
        externalId: normalized.value?.externalId ?? null,
        type: normalized.errors[0].type,
        message: normalized.errors[0].message,
        payload: record,
      });
      continue;
    }

    const value = normalized.value;
    const city = value.city || value.district || value.state;
    const districtId = value.district ? districtIndex.get(value.district) ?? null : null;

    try {
      const result = await client.query(
        `insert into blood_facilities
           (name, category, city, state, district, district_id, address, postal_code,
            phone, latitude, longitude, operating_hours, source_url, external_id,
            verification_status, status, data_source_id, source_note, last_verified_at, has_blood_bank)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                 'provider_authorized','approved',$15,$16, now(), true)
         on conflict (data_source_id, external_id) where external_id is not null
         do update set
           name = excluded.name,
           category = excluded.category,
           city = excluded.city,
           state = excluded.state,
           district = excluded.district,
           district_id = excluded.district_id,
           address = coalesce(excluded.address, blood_facilities.address),
           postal_code = coalesce(excluded.postal_code, blood_facilities.postal_code),
           phone = coalesce(excluded.phone, blood_facilities.phone),
           latitude = coalesce(excluded.latitude, blood_facilities.latitude),
           longitude = coalesce(excluded.longitude, blood_facilities.longitude),
           operating_hours = coalesce(excluded.operating_hours, blood_facilities.operating_hours),
           source_url = coalesce(excluded.source_url, blood_facilities.source_url),
           verification_status = 'provider_authorized',
           status = 'approved',
           last_verified_at = now()
         returning id`,
        [
          value.name,
          value.category,
          city,
          value.state,
          value.district,
          districtId,
          value.address,
          value.postalCode,
          value.phone,
          value.latitude,
          value.longitude,
          value.operatingHours,
          value.sourceUrl,
          value.externalId,
          providerId,
          `Synchronised from ${providerId}. MEDIPAL has not inspected this centre on site.`,
        ],
      );
      idByExternal.set(value.externalId, result.rows[0].id);
      upserted += 1;
    } catch (error) {
      errors.push({
        externalId: value.externalId,
        type: ERROR_TYPES.CENTRE_UNRESOLVED,
        message: `The centre could not be written: ${error.message}`,
        payload: record,
      });
    }
  }

  return { idByExternal, upserted };
}

/**
 * Writes one provider inventory figure, deciding between insert, update, and
 * no-op by comparing against what is already stored. A row that did not
 * meaningfully change writes nothing — `inventory_history` is a change log,
 * not a polling log.
 */
async function writeInventory(
  client,
  { facilityId, providerId, record, runId, existing },
) {
  const grain = `${facilityId}:${record.bloodGroup}:${record.component}`;
  const previous = existing.get(grain);

  const syncable = {
    quantity: record.units,
    availabilityStatus: record.availabilityStatus,
    sourceUpdatedAt: record.sourceUpdatedAt,
  };

  if (!previous) {
    const inserted = await client.query(
      `insert into blood_inventory
         (facility_id, blood_group, component, quantity, unit, status, data_source_id,
          source_record_id, source_updated_at, synced_at, availability_status, last_updated_at, reported_by)
       values ($1,$2,$3,$4,$5,'available',$6,$7,$8, now(), $9, now(), $10)
       on conflict (facility_id, blood_group, component) where source_record_id is not null
       do update set quantity = excluded.quantity,
                     availability_status = excluded.availability_status,
                     source_updated_at = excluded.source_updated_at,
                     source_record_id = excluded.source_record_id,
                     synced_at = now(),
                     last_updated_at = now()
       returning id`,
      [
        facilityId,
        record.bloodGroup,
        record.component,
        syncable.quantity,
        record.unit,
        providerId,
        record.sourceRecordId,
        syncable.sourceUpdatedAt,
        syncable.availabilityStatus,
        `provider:${providerId}`,
      ],
    );

    await writeHistory(client, {
      facilityId,
      inventoryId: inserted.rows[0].id,
      bloodGroup: record.bloodGroup,
      component: record.component,
      previousUnits: null,
      newUnits: syncable.quantity,
      previousStatus: null,
      newStatus: syncable.availabilityStatus,
      source: providerId,
      syncRunId: runId,
      sourceUpdatedAt: syncable.sourceUpdatedAt,
    });

    broadcast({
      type: "inventory.change",
      change: "inserted",
      facilityId,
      bloodGroup: record.bloodGroup,
      component: record.component,
      units: syncable.quantity,
      availabilityStatus: syncable.availabilityStatus,
      sourceUpdatedAt: syncable.sourceUpdatedAt,
      source: providerId,
    });
    return "inserted";
  }

  const unchanged =
    previous.quantity === syncable.quantity &&
    previous.availability_status === syncable.availabilityStatus &&
    String(previous.source_updated_at ?? "") === String(syncable.sourceUpdatedAt ?? "");

  if (unchanged) return "unchanged";

  await client.query(
    `update blood_inventory
        set quantity = $2,
            availability_status = $3,
            source_updated_at = $4,
            source_record_id = $5,
            unit = $6,
            synced_at = now(),
            last_updated_at = now()
      where id = $1`,
    [
      previous.id,
      syncable.quantity,
      syncable.availabilityStatus,
      syncable.sourceUpdatedAt,
      record.sourceRecordId,
      record.unit,
    ],
  );

  await writeHistory(client, {
    facilityId,
    inventoryId: previous.id,
    bloodGroup: record.bloodGroup,
    component: record.component,
    previousUnits: previous.quantity,
    newUnits: syncable.quantity,
    previousStatus: previous.availability_status,
    newStatus: syncable.availabilityStatus,
    source: providerId,
    syncRunId: runId,
    sourceUpdatedAt: syncable.sourceUpdatedAt,
  });

  broadcast({
    type: "inventory.change",
    change: "updated",
    facilityId,
    bloodGroup: record.bloodGroup,
    component: record.component,
    previousUnits: previous.quantity,
    units: syncable.quantity,
    availabilityStatus: syncable.availabilityStatus,
    sourceUpdatedAt: syncable.sourceUpdatedAt,
    source: providerId,
  });

  return "updated";
}

function writeHistory(client, entry) {
  return client.query(
    `insert into inventory_history
       (facility_id, inventory_id, blood_group, component, previous_units, new_units,
        previous_status, new_status, source, sync_run_id, source_updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      entry.facilityId,
      entry.inventoryId,
      entry.bloodGroup,
      entry.component,
      entry.previousUnits,
      entry.newUnits,
      entry.previousStatus,
      entry.newStatus,
      entry.source,
      entry.syncRunId,
      entry.sourceUpdatedAt,
    ],
  );
}

async function writeErrors(client, runId, errors) {
  if (errors.length === 0) return;
  for (const error of errors) {
    await client.query(
      `insert into sync_errors (sync_run_id, external_id, error_type, error_message, payload_hash, payload_excerpt)
       values ($1,$2,$3,$4,$5,$6)`,
      [
        runId,
        error.externalId ?? null,
        error.type,
        error.message,
        payloadHash(error.payload),
        safeExcerpt(error.payload),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// The run itself
// ---------------------------------------------------------------------------

/**
 * Runs one synchronisation of one provider.
 *
 * @param {{ providerId: string, trigger?: "schedule"|"manual"|"startup"|"retry", actor?: string }} options
 */
export async function runSync({ providerId, trigger = "manual", actor = "system" }) {
  const provider = await getProvider(providerId);

  // A push-style source is authored directly in MEDIPAL's own database; there
  // is nothing to fetch, and re-reading it would double-count stock.
  if (provider.mode === "push") {
    const health = await provider.healthCheck();
    return skipRun(
      providerId,
      trigger,
      "This source is written directly by the blood-centre portal, so there is nothing to pull. " +
        "Its health is tracked from the observations centres have published.",
      health.status === "healthy" ? "healthy" : health.status,
    );
  }

  if (!provider.enabled) {
    return skipRun(
      providerId,
      trigger,
      `${provider.label} is disabled in the source register. Enable it before a sync can read from it.`,
      provider.isConfigured() ? "unknown" : "not_configured",
    );
  }

  if (!provider.isConfigured()) {
    return skipRun(
      providerId,
      trigger,
      `${provider.label} is enabled but not configured. MEDIPAL will not invent an endpoint or a key. ` +
        "Supply the issued credentials in `.env.server`.",
      "not_configured",
    );
  }

  const startedAt = Date.now();
  const run = await startRun(providerId, trigger);
  const summary = {
    received: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    centresUpserted: 0,
    attempts: 0,
    durationMs: 0,
  };
  const errors = [];
  let notRestated = 0;

  try {
    const [districtNames, districtIndex] = await Promise.all([loadDistrictNames(), loadDistrictIndex()]);

    // Steps 3-4: fetch. A fetch failure is a run failure, and never a delete.
    const centresResponse = await provider.fetchBloodCentres();
    const availabilityResponse = await provider.fetchAvailability();
    summary.attempts = (centresResponse.attempts ?? 0) + (availabilityResponse.attempts ?? 0);

    const centreRecords = (centresResponse.records ?? []).slice(0, config.blood.maxRecordsPerRun);
    const availabilityRecords = (availabilityResponse.records ?? []).slice(0, config.blood.maxRecordsPerRun);
    summary.received = availabilityRecords.length;

    // Step 5-8: validate, normalise, and resolve each inventory record onto a
    // centre. Records are normalised BEFORE the write transaction opens so a
    // rejected row can never partially apply.
    const prepared = [];
    for (const record of availabilityRecords) {
      const normalized = normalizeInventoryRecord(record, {
        districtNames,
        lowUnitsThreshold: config.blood.lowUnitsThreshold,
      });
      if (!normalized.ok) {
        errors.push({
          externalId: normalized.value?.centreExternalId ?? null,
          type: normalized.errors[0].type,
          message: normalized.errors[0].message,
          payload: record,
        });
        summary.failed += 1;
        continue;
      }
      prepared.push(normalized.value);
    }

    // Steps 9-11: write, atomically.
    await withTransaction(async (client) => {
      const { idByExternal, upserted } = await writeCentres(
        client,
        providerId,
        centreRecords,
        districtNames,
        districtIndex,
        run.id,
        errors,
      );
      summary.centresUpserted = upserted;

      // A second pass lets an inventory record resolve against a centre that a
      // previous run already stored, even if this run's centre feed omitted it.
      const missingCentres = prepared
        .map((record) => record.centreExternalId)
        .filter((externalId) => externalId && !idByExternal.has(externalId));
      if (missingCentres.length > 0) {
        const known = await client.query(
          `select external_id, id from blood_facilities
            where data_source_id = $1 and external_id = any($2::text[])`,
          [providerId, [...new Set(missingCentres)]],
        );
        for (const row of known.rows) idByExternal.set(row.external_id, row.id);
      }

      const facilityIds = [...new Set([...idByExternal.values()])];
      const existing = new Map();
      if (facilityIds.length > 0) {
        const rows = await client.query(
          `select id, facility_id, blood_group, component, quantity, availability_status, source_updated_at
             from blood_inventory
            where source_record_id is not null and facility_id = any($1::uuid[])`,
          [facilityIds],
        );
        for (const row of rows.rows) {
          existing.set(`${row.facility_id}:${row.blood_group}:${row.component}`, row);
        }
      }

      const seen = new Set();
      for (const record of prepared) {
        const facilityId = idByExternal.get(record.centreExternalId);
        if (!facilityId) {
          errors.push({
            externalId: record.centreExternalId,
            type: ERROR_TYPES.CENTRE_UNRESOLVED,
            message: "The inventory record refers to a centre that this feed has never published.",
            payload: record,
          });
          summary.failed += 1;
          continue;
        }
        const outcome = await writeInventory(client, {
          facilityId,
          providerId,
          record,
          runId: run.id,
          existing,
        });
        if (outcome === "inserted") summary.inserted += 1;
        else if (outcome === "updated") summary.updated += 1;
        else summary.unchanged += 1;
        seen.add(`${facilityId}:${record.bloodGroup}:${record.component}`);
      }

      // Step 12: figures the provider did not restate this run are deliberately
      // LEFT IN PLACE. Age is reported through the freshness ladder; deleting
      // them would turn "we did not hear about this group" into "there is no
      // blood", which is exactly the lie this system exists to prevent.
      notRestated = [...existing.keys()].filter((key) => !seen.has(key)).length;

      await writeErrors(client, run.id, errors);
    });

    summary.durationMs = Date.now() - startedAt;
    const status =
      summary.failed === 0
        ? "success"
        : summary.inserted + summary.updated + summary.unchanged > 0
          ? "partial"
          : "failed";

    const message =
      notRestated > 0
        ? `${notRestated} previously reported figure(s) were not restated by this run and were kept unchanged, ` +
          "aged by the freshness ladder rather than deleted."
        : null;

    await finishRun(run.id, summary, status, message);
    await updateSourceHealth(providerId, status === "success" ? "healthy" : "degraded", message ?? "Synchronisation completed.");
    await audit({
      actor,
      action: "blood.sync.run",
      entity: "sync_run",
      entityId: run.id,
      detail: `${providerId} ${trigger} ${status} received=${summary.received} inserted=${summary.inserted} updated=${summary.updated} failed=${summary.failed} notRestated=${notRestated}`,
    });

    broadcast({
      type: "sync.completed",
      provider: providerId,
      runId: run.id,
      status,
      records: { ...summary, notRestated },
    });

    return {
      provider: providerId,
      runId: run.id,
      status,
      message,
      records: { ...summary, notRestated },
      centresUpserted: summary.centresUpserted,
      errors: errors.slice(0, 20).map((error) => ({
        externalId: error.externalId,
        type: error.type,
        message: error.message,
      })),
      durationMs: summary.durationMs,
    };
  } catch (error) {
    summary.durationMs = Date.now() - startedAt;
    await finishRun(run.id, summary, "failed", error.message);
    await updateSourceHealth(providerId, "degraded", error.message);
    await audit({
      actor,
      action: "blood.sync.failed",
      entity: "sync_run",
      entityId: run.id,
      detail: `${providerId} ${trigger} failed: ${error.message}`,
    });
    broadcast({ type: "sync.failed", provider: providerId, runId: run.id, message: error.message });

    if (error instanceof ProviderError && error.code === PROVIDER_CODES.NOT_CONFIGURED) {
      throw new HttpError(503, error.message, "PROVIDER_NOT_CONFIGURED");
    }
    throw error;
  }
}

/** Runs every provider the scheduler is allowed to pull from. */
export async function runScheduledSyncs(trigger = "schedule") {
  const providers = await getRunnableProviders();
  const results = [];
  for (const provider of providers) {
    try {
      results.push(await runSync({ providerId: provider.id, trigger, actor: "scheduler" }));
    } catch (error) {
      // One source failing must never stop another from being read.
      results.push({ provider: provider.id, status: "failed", message: error.message });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Health surface (§25)
// ---------------------------------------------------------------------------

/** The provider/health payload returned by `GET /api/blood/health`. */
export async function providerHealth() {
  const providers = await getProviders();

  let register = new Map();
  try {
    const result = await query(
      `select id, name, enabled, priority, health_status, health_message, last_health_check_at,
              last_successful_sync, last_failed_sync, base_url, verification_status
         from blood_data_sources`,
    );
    register = new Map(result.rows.map((row) => [row.id, row]));
  } catch {
    register = new Map();
  }

  const sources = [];
  for (const provider of providers) {
    const row = register.get(provider.id);
    const health = await provider.healthCheck().catch((error) => ({
      status: "offline",
      message: error.message,
      checkedAt: new Date().toISOString(),
    }));

    // The stored health wins when a sync has already judged it; the live probe
    // only fills the gap for a source that has never been synced.
    const derived = computeSourceHealth({
      enabled: provider.enabled,
      configured: provider.isConfigured(),
      lastSuccessfulSync: row?.last_successful_sync ?? null,
      lastFailedSync: row?.last_failed_sync ?? null,
    });

    sources.push({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      configured: provider.isConfigured(),
      priority: provider.priority,
      mode: provider.mode ?? "pull",
      health: provider.isConfigured() ? (row?.health_status && row.health_status !== "unknown" ? row.health_status : derived) : "not_configured",
      healthMessage: row?.health_message ?? health.message,
      lastSuccessfulSync: row?.last_successful_sync ? new Date(row.last_successful_sync).toISOString() : null,
      lastFailedSync: row?.last_failed_sync ? new Date(row.last_failed_sync).toISOString() : null,
      lastHealthCheckAt: row?.last_health_check_at ? new Date(row.last_health_check_at).toISOString() : health.checkedAt,
      baseUrlConfigured: Boolean(row?.base_url),
      verificationStatus: row?.verification_status ?? "unverified",
    });
  }

  let records = { total: 0, providerRows: 0, live: 0 };
  try {
    const result = await query(
      `select count(*)::int as total,
              count(*) filter (where source_record_id is not null)::int as provider_rows,
              count(*) filter (
                where source_record_id is not null
                  and source_updated_at is not null
                  and source_updated_at > now() - ($1::int * interval '1 minute')
              )::int as live
         from blood_inventory`,
      [config.blood.liveThresholdMinutes],
    );
    records = {
      total: result.rows[0]?.total ?? 0,
      providerRows: result.rows[0]?.provider_rows ?? 0,
      live: result.rows[0]?.live ?? 0,
    };
  } catch {
    /* the table may not exist yet */
  }

  let lastRun = null;
  try {
    const result = await query(
      `select provider, status, started_at, completed_at, records_received, records_inserted, records_updated,
              records_unchanged, records_failed, centres_upserted, request_attempts, error_message, duration_ms
         from sync_runs order by started_at desc limit 1`,
    );
    if (result.rowCount > 0) lastRun = serialiseRun(result.rows[0]);
  } catch {
    /* the table may not exist yet */
  }

  const lastStarted = lastRun?.startedAt ? Date.parse(lastRun.startedAt) : NaN;
  const nextSyncInMinutes = Number.isFinite(lastStarted)
    ? Math.max(
        0,
        Math.round(config.blood.syncIntervalMinutes - (Date.now() - lastStarted) / 60_000),
      )
    : null;

  return {
    status: sources.some((source) => source.health === "offline")
      ? "offline"
      : sources.some((source) => source.health === "degraded")
        ? "degraded"
        : sources.some((source) => source.health === "healthy")
          ? "healthy"
          : "not_configured",
    generatedAt: new Date().toISOString(),
    syncIntervalMinutes: config.blood.syncIntervalMinutes,
    thresholdsMinutes: {
      live: config.blood.liveThresholdMinutes,
      recent: config.blood.recentThresholdMinutes,
      stale: config.blood.staleThresholdMinutes,
    },
    lastSuccessfulSync: sources
      .map((source) => source.lastSuccessfulSync)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
    nextSyncInMinutes,
    sources,
    records,
    lastRun,
    notice:
      "MEDIPAL reports a source as live only while an authorised feed is actually delivering figures. " +
      "When a source is not configured, no number from it is shown at all.",
  };
}

export function serialiseRun(row) {
  return {
    provider: row.provider,
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    recordsReceived: row.records_received,
    recordsInserted: row.records_inserted,
    recordsUpdated: row.records_updated,
    recordsUnchanged: row.records_unchanged,
    recordsFailed: row.records_failed,
    centresUpserted: row.centres_upserted,
    requestAttempts: row.request_attempts,
    durationMs: row.duration_ms,
    message: row.error_message,
  };
}
