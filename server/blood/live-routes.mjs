/**
 * Bihar live-availability API routes.
 *
 * These are the endpoints the specification adds on top of the existing Blood
 * Bank module (§11-§13, §17, §25). They are kept in their own module so the
 * very large `server/blood.mjs` router only gains one delegation line.
 *
 * Every response carries provenance: the source id, the source's own
 * observation time, and a freshness verdict computed on the server. Nothing
 * here ever upgrades an old figure to "live".
 */

import { config } from "../env.mjs";
import { HttpError, sendJson } from "../http.mjs";
import { query } from "../db.mjs";
import { requireAdmin } from "../blood.mjs";
import { enforceRateLimit } from "../rate-limit.mjs";
import { computeFreshnessLevel, FRESHNESS_THRESHOLDS } from "./freshness.mjs";
import { providerHealth, runSync, serialiseRun } from "./sync.mjs";
import { schedulerStatus } from "./scheduler.mjs";
import { subscribe, subscriberCount } from "./live-hub.mjs";

/** The line every result must be able to show, verbatim (§28). */
export const AVAILABILITY_DISCLAIMER =
  "Reported availability. Please call the blood centre to confirm before travelling.";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const COMPONENT_ALIASES = new Map([
  ["packedredbloodcells", "Packed Red Blood Cells"],
  ["wholeblood", "Whole Blood"],
  ["platelets", "Platelets"],
  ["freshfrozenplasma", "Fresh Frozen Plasma"],
  ["cryoprecipitate", "Cryoprecipitate"],
]);

function oneOrNull(params, key) {
  const value = params.get(key);
  return value && value.trim() ? value.trim() : null;
}

function resolveComponent(params) {
  const raw = oneOrNull(params, "component");
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  const canonical = COMPONENT_ALIASES.get(key);
  if (!canonical) {
    throw new HttpError(400, `Component must be one of: ${[...COMPONENT_ALIASES.values()].join(", ")}.`, "VALIDATION");
  }
  return canonical;
}

/**
 * The emergency ranking from §16, in one place so the API and the UI can never
 * disagree. Stale or undated figures sort below everything that is still known
 * to be current — an outdated number is never allowed to look like stock you
 * can rely on tonight.
 */
export function emergencyRank(row) {
  const units = row.units ?? 0;
  const level = row.freshness;
  if (level === "LIVE" && units > 0 && row.availabilityStatus !== "LOW") return 0;
  if (level === "RECENT" && units > 0 && row.availabilityStatus !== "LOW") return 1;
  if (row.availabilityStatus === "LOW" && units > 0 && (level === "LIVE" || level === "RECENT")) return 2;
  if (units > 0 && (level === "STALE" || level === "OUTDATED")) return 3;
  if (units > 0) return 4;
  return 5;
}

export function sortForEmergency(rows) {
  return [...rows].sort(
    (a, b) =>
      emergencyRank(a) - emergencyRank(b) ||
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
  );
}

// ---------------------------------------------------------------------------
// Shared row loading
// ---------------------------------------------------------------------------

/**
 * Reads the aggregated, contact-free availability view and decorates each row
 * with the freshness ladder, the source's priority and the distance from the
 * caller. The heavy lifting is one indexed query; the decoration is pure.
 */
async function loadLiveRows({ bloodGroup, component, district, state = "Bihar", latitude, longitude }) {
  const clauses = ["f.status = 'approved'"];
  const params = [];

  if (state) {
    params.push(state);
    clauses.push(`f.state = $${params.length}`);
  }
  if (district) {
    params.push(district);
    clauses.push(`(f.district = $${params.length} or d.name = $${params.length})`);
  }
  if (bloodGroup) {
    params.push(bloodGroup);
    clauses.push(`v.blood_group = $${params.length}::blood_group`);
  }
  if (component) {
    params.push(component);
    clauses.push(`v.component = $${params.length}::blood_component`);
  }

  const result = await query(
    `select v.facility_id, v.facility_ref, v.external_id, v.facility_name, v.facility_category,
            v.address, v.city, v.district, v.district_name, v.state, v.postal_code,
            v.latitude, v.longitude, v.phone, v.emergency_hotline,
            v.facility_verification_status, v.source_url, v.data_source_id, v.source_note,
            v.blood_group, v.component, v.available_quantity, v.unit,
            v.availability_status, v.inventory_last_updated_at, v.source_updated_at, v.synced_at,
            v.is_provider_synced, v.batch_count, v.nearest_expiry_date,
            s.name as source_name, s.priority as source_priority,
            s.verification_status as source_verification_status, s.url as source_register_url
       from blood_public_availability v
       join blood_facilities f on f.id = v.facility_id
       left join districts d on d.id = f.district_id
       join blood_data_sources s on s.id = f.data_source_id
      where ${clauses.join(" and ")}
      order by s.priority asc, v.facility_name asc`,
    params,
  );

  const now = Date.now();
  const hasOrigin = Number.isFinite(latitude) && Number.isFinite(longitude);

  return result.rows.map((row) => {
    const observedAt = row.source_updated_at ?? row.inventory_last_updated_at ?? null;
    const freshness = computeFreshnessLevel(observedAt, FRESHNESS_THRESHOLDS, now);
    const distanceKm =
      hasOrigin && row.latitude !== null && row.longitude !== null
        ? round1(haversine(latitude, longitude, row.latitude, row.longitude))
        : null;

    return {
      centreId: row.facility_id,
      reference: row.facility_ref,
      externalId: row.external_id,
      name: row.facility_name,
      category: row.facility_category,
      address: row.address,
      city: row.city,
      district: row.district_name ?? row.district,
      state: row.state,
      postalCode: row.postal_code,
      coordinates:
        row.latitude !== null && row.longitude !== null ? [row.latitude, row.longitude] : null,
      phone: row.phone,
      emergencyHotline: row.emergency_hotline,
      verification: row.facility_verification_status,
      bloodGroup: row.blood_group,
      component: row.component,
      units: row.available_quantity ?? 0,
      unit: row.unit ?? "Units",
      availabilityStatus: row.availability_status ?? "UNKNOWN",
      freshness,
      lastUpdatedAt: observedAt ? new Date(observedAt).toISOString() : null,
      syncedAt: row.synced_at ? new Date(row.synced_at).toISOString() : null,
      isProviderSynced: row.is_provider_synced === true,
      batchCount: row.batch_count ?? 0,
      nearestExpiryDate: row.nearest_expiry_date ?? null,
      distanceKm,
      source: {
        id: row.data_source_id,
        label: row.source_name,
        priority: row.source_priority,
        verificationStatus: row.source_verification_status,
        url: row.source_url ?? row.source_register_url ?? null,
        note: row.source_note,
      },
      disclaimer: AVAILABILITY_DISCLAIMER,
    };
  });
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function listDistricts(params) {
  const state = oneOrNull(params, "state") ?? "Bihar";
  const result = await query(
    `select d.id, d.name, d.state, d.latitude, d.longitude,
            (select count(*)::int from blood_facilities f
              where f.district_id = d.id and f.status = 'approved') as centres
       from districts d
      where d.state = $1
      order by d.name`,
    [state],
  );
  return {
    state,
    count: result.rowCount,
    districts: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      state: row.state,
      centre: row.latitude !== null && row.longitude !== null ? [row.latitude, row.longitude] : null,
      approvedCentres: row.centres,
    })),
    note:
      "District coordinates are administrative headquarters, used only to centre a map and to bound a " +
      "radius search. They are never presented as the location of a blood centre.",
  };
}

async function listCentres(params) {
  const bloodGroup = oneOrNull(params, "bloodGroup");
  if (bloodGroup && !BLOOD_GROUPS.includes(bloodGroup)) {
    throw new HttpError(400, "Blood group must be one of A+/A-/B+/B-/AB+/AB-/O+/O-.", "VALIDATION");
  }
  const component = resolveComponent(params);
  const district = oneOrNull(params, "district");
  const latitude = Number.parseFloat(params.get("latitude") ?? params.get("lat") ?? "");
  const longitude = Number.parseFloat(params.get("longitude") ?? params.get("lng") ?? "");
  const radiusRaw = Number.parseFloat(params.get("radius") ?? params.get("radiusKm") ?? "");
  const radiusKm = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, 500) : null;
  const limit = Math.min(Number.parseInt(params.get("limit") ?? "", 10) || 100, 500);
  const sortBy = oneOrNull(params, "sortBy") ?? (radiusKm ? "distance" : "priority");

  let rows = await loadLiveRows({ bloodGroup, component, district, latitude, longitude });

  if (radiusKm !== null) {
    rows = rows.filter((row) => row.distanceKm === null || row.distanceKm <= radiusKm);
  }

  if (sortBy === "emergency") {
    rows = sortForEmergency(rows);
  } else if (sortBy === "distance") {
    rows = [...rows].sort(
      (a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
    );
  } else if (sortBy === "freshness") {
    const order = { LIVE: 0, RECENT: 1, STALE: 2, OUTDATED: 3, UNKNOWN: 4 };
    rows = [...rows].sort((a, b) => order[a.freshness] - order[b.freshness]);
  }

  const truncated = rows.length > limit;

  return {
    query: {
      state: "Bihar",
      district,
      bloodGroup,
      component,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      radiusKm,
      sortBy,
      limit,
    },
    thresholdsMinutes: FRESHNESS_THRESHOLDS,
    counts: {
      rows: rows.length,
      shown: Math.min(rows.length, limit),
      centres: new Set(rows.map((row) => row.centreId)).size,
    },
    results: rows.slice(0, limit),
    truncated,
    generatedAt: new Date().toISOString(),
    disclaimer: AVAILABILITY_DISCLAIMER,
    notice:
      "Sorted by source priority first: an official authorised feed outranks a verified blood centre's " +
      "own report. Where two sources disagree, both remain visible — MEDIPAL never overwrites one with the other.",
  };
}

/**
 * `GET /api/blood/nearby` — blood centres around a point, nearest first.
 *
 * The maps-directory lookup that shares this path (a place name rather than a
 * coordinate) is served by the Geoapify proxy in `server/index.mjs`, which runs
 * first and only falls through to here when a coordinate is supplied. So a
 * place-name search keeps returning directory listings, and a coordinate search
 * returns MEDIPAL's own centres — two different questions, two different,
 * honestly-labelled answers.
 */
async function nearbyCentres(params) {
  const latitude = Number.parseFloat(params.get("latitude") ?? params.get("lat") ?? "");
  const longitude = Number.parseFloat(params.get("longitude") ?? params.get("lng") ?? "");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  const bloodGroup = oneOrNull(params, "bloodGroup");
  const component = resolveComponent(params);
  const radiusRaw = Number.parseFloat(params.get("radius") ?? params.get("radiusKm") ?? "");
  const radiusKm = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, 500) : 25;
  const limit = Math.min(Number.parseInt(params.get("limit") ?? "", 10) || 40, 200);

  const rows = (await loadLiveRows({ bloodGroup, component, latitude, longitude }))
    .filter((row) => row.distanceKm !== null && row.distanceKm <= radiusKm)
    .map((row) => ({ ...row, distanceKm: round1(row.distanceKm) }));

  const ranked = sortForEmergency(rows);

  return {
    origin: { latitude, longitude },
    radiusKm,
    query: { bloodGroup, component },
    counts: { centres: new Set(ranked.map((row) => row.centreId)).size, rows: ranked.length },
    results: ranked.slice(0, limit),
    truncated: ranked.length > limit,
    generatedAt: new Date().toISOString(),
    disclaimer: AVAILABILITY_DISCLAIMER,
    notice:
      "Ordered for an emergency: confirmed and recently reported stock first, then low stock, then " +
      "unconfirmed figures. A stale or undated row is never presented as confirmed available.",
  };
}

/** `GET /api/blood/stream` — server-sent events for live inventory changes. */
function streamChanges(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write(`retry: 5000\n\n`);

  const unsubscribe = subscribe(response);
  // A comment ping keeps intermediaries from closing an idle stream.
  const ping = setInterval(() => {
    try {
      response.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(ping);
    }
  }, 25_000);

  const cleanup = () => {
    clearInterval(ping);
    unsubscribe();
  };
  request.on("close", cleanup);
  request.on("error", cleanup);
  return true;
}

// ---------------------------------------------------------------------------
// Admin surface (§17)
// ---------------------------------------------------------------------------

async function bloodDataOverview() {
  const [centres, inventory, claims] = await Promise.all([
    query(
      `select count(*)::int as total,
              count(*) filter (where status = 'approved')::int as approved,
              count(*) filter (where verification_status = 'provider_authorized')::int as from_providers,
              count(*) filter (where data_source_id = 'blood_centre_verified')::int as from_centres
         from blood_facilities`,
    ),
    query(
      `select count(*)::int as rows,
              count(distinct facility_id)::int as centres_with_stock,
              count(*) filter (where source_record_id is not null)::int as provider_rows,
              count(*) filter (
                where source_updated_at is not null
                  and source_updated_at > now() - ($1::int * interval '1 minute')
              )::int as live_rows,
              count(*) filter (
                where source_updated_at is not null
                  and source_updated_at <= now() - ($2::int * interval '1 minute')
              )::int as stale_rows,
              count(*) filter (where availability_status = 'UNAVAILABLE')::int as unavailable_rows,
              count(*) filter (where availability_status = 'UNKNOWN')::int as unknown_rows
         from blood_inventory`,
      [config.blood.liveThresholdMinutes, config.blood.staleThresholdMinutes],
    ),
    query(
      `select count(*)::int as total,
              count(*) filter (where status = 'success')::int as succeeded,
              count(*) filter (where status in ('partial','failed'))::int as troubled,
              count(*) filter (where status = 'failed')::int as failed,
              max(completed_at) filter (where status = 'success') as last_success,
              max(completed_at) as last_attempt
         from sync_runs
        where started_at > now() - interval '7 days'`,
    ),
  ]);

  const runs = claims.rows[0];
  const attempted = runs.succeeded + runs.troubled;
  return {
    centres: {
      total: centres.rows[0].total,
      approved: centres.rows[0].approved,
      fromProviders: centres.rows[0].from_providers,
      fromVerifiedCentres: centres.rows[0].from_centres,
    },
    inventory: {
      rows: inventory.rows[0].rows,
      centresWithStock: inventory.rows[0].centres_with_stock,
      providerRows: inventory.rows[0].provider_rows,
      liveRows: inventory.rows[0].live_rows,
      staleRows: inventory.rows[0].stale_rows,
      unavailableRows: inventory.rows[0].unavailable_rows,
      unknownRows: inventory.rows[0].unknown_rows,
    },
    sync: {
      runsLastSevenDays: runs.total,
      succeeded: runs.succeeded,
      failed: runs.failed,
      successRate: attempted === 0 ? null : Math.round((runs.succeeded / attempted) * 1000) / 10,
      lastSuccessfulSync: runs.last_success ? new Date(runs.last_success).toISOString() : null,
      lastAttemptAt: runs.last_attempt ? new Date(runs.last_attempt).toISOString() : null,
    },
    thresholdsMinutes: FRESHNESS_THRESHOLDS,
    intervalMinutes: config.blood.syncIntervalMinutes,
    generatedAt: new Date().toISOString(),
  };
}

async function listSyncRuns(params) {
  const limit = Math.min(Number.parseInt(params.get("limit") ?? "", 10) || 25, 100);
  const provider = oneOrNull(params, "provider");

  const runs = await query(
    `select id, provider, status, started_at, completed_at, records_received, records_inserted, records_updated,
            records_unchanged, records_failed, centres_upserted, request_attempts, duration_ms, error_message
       from sync_runs
      where ($1::text is null or provider = $1::text)
      order by started_at desc
      limit $2`,
    [provider, limit],
  );

  const ids = runs.rows.map((row) => row.id);
  let errors = [];
  if (ids.length > 0) {
    const result = await query(
      `select sync_run_id, external_id, error_type, error_message, payload_excerpt, created_at
         from sync_errors
        where sync_run_id = any($1::uuid[])
        order by created_at desc
        limit 200`,
      [ids],
    );
    errors = result.rows;
  }

  const grouped = new Map();
  for (const error of errors) {
    if (!grouped.has(error.sync_run_id)) grouped.set(error.sync_run_id, []);
    grouped.get(error.sync_run_id).push({
      externalId: error.external_id,
      type: error.error_type,
      message: error.error_message,
      excerpt: error.payload_excerpt,
      at: new Date(error.created_at).toISOString(),
    });
  }

  return {
    runs: runs.rows.map((row) => ({
      ...serialiseRun(row),
      runId: row.id,
      errors: grouped.get(row.id) ?? [],
    })),
    providerFilter: provider,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<boolean>} true when the route was handled.
 */
export async function handleLiveBloodRoute(request, response, url) {
  const { pathname, searchParams } = url;
  const method = request.method;

  // ---- public ---------------------------------------------------------------
  if (method === "GET" && pathname === "/api/blood/districts") {
    sendJson(response, 200, await listDistricts(searchParams));
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/centres") {
    sendJson(response, 200, await listCentres(searchParams));
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/nearby") {
    const payload = await nearbyCentres(searchParams);
    if (payload === false) return false;
    sendJson(response, 200, payload);
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/health") {
    sendJson(response, 200, await providerHealth());
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/stream") {
    return streamChanges(request, response);
  }

  // ---- platform admin -------------------------------------------------------
  if (pathname.startsWith("/api/blood/admin/")) {
    const tail = pathname.slice("/api/blood/admin/".length);

    if (method === "GET" && tail === "blood-data") {
      requireAdmin(request);
      sendJson(response, 200, {
        overview: await bloodDataOverview(),
        health: await providerHealth(),
        scheduler: schedulerSummary(),
      });
      return true;
    }

    if (method === "GET" && tail === "sync-runs") {
      requireAdmin(request);
      sendJson(response, 200, await listSyncRuns(searchParams));
      return true;
    }

    if (method === "POST" && tail === "sync/run") {
      // A sync trigger reaches an external provider, so it is rate limited per
      // caller BEFORE the key is checked: an unauthenticated probe must not be
      // able to hammer the endpoint, and a legitimate admin cannot accidentally
      // start more than a handful of runs a minute (§20).
      enforceRateLimit(`blood-sync:${request.socket?.remoteAddress || "unknown"}`, {
        windowMs: 5 * 60_000,
        max: 10,
      });
      requireAdmin(request);
      const providerId = oneOrNull(searchParams, "provider");
      if (!providerId) {
        throw new HttpError(400, "Name the source to synchronise with ?provider=…", "VALIDATION");
      }
      const result = await runSync({ providerId, trigger: "manual", actor: "platform_admin" });
      sendJson(response, 200, {
        ...result,
        subscribers: subscriberCount(),
        note:
          result.status === "skipped"
            ? result.message
            : "The run is recorded in the sync log with its per-record outcome.",
      });
      return true;
    }

    return false;
  }

  return false;
}

/** Scheduler state comes from the scheduler itself, so there is one truth. */
function schedulerSummary() {
  return {
    ...schedulerStatus(),
    thresholdsMinutes: FRESHNESS_THRESHOLDS,
  };
}
