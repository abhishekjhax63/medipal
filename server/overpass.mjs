/**
 * OpenStreetMap healthcare directory — the real hospital data source.
 *
 * Two public OpenStreetMap services are used, and neither needs an API key or a
 * paid plan:
 *
 *  - **Nominatim** (`/search`, `/reverse`) turns a typed place — city, area,
 *    PIN code — or a device fix into real coordinates.
 *  - **Overpass API** returns the actual healthcare facilities around those
 *    coordinates: hospitals, clinics, blood services, pharmacies, doctors and
 *    dentists, exactly as OpenStreetMap contributors recorded them.
 *
 * Honest-data rules enforced here:
 *  - Nothing is invented. A tag OpenStreetMap does not carry stays `null`, and
 *    the UI must render an "not published" state rather than a placeholder.
 *  - A facility that is present on a map is NOT evidence of blood stock, of a
 *    service menu, or of a doctor. This module therefore returns *locations and
 *    contact details only* — never an availability or inventory figure.
 *  - Duplicate records and records with no name and no address are dropped.
 *  - Provider usage policy is respected: responses are cached, and Nominatim
 *    calls are serialised to at most one request per second with an identifying
 *    User-Agent.
 *
 * Attribution: facility data © OpenStreetMap contributors, available under the
 * Open Database License (ODbL).
 */

import { config, readiness } from "./env.mjs";
import { HttpError } from "./http.mjs";

export const OSM_ATTRIBUTION = {
  text: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
  licence: "Open Database License (ODbL) 1.0",
};

export const OSM_SOURCES = {
  geocoder: "Nominatim (OpenStreetMap)",
  directory: "Overpass API (OpenStreetMap)",
};

export const FACILITY_KINDS = [
  "hospital",
  "clinic",
  "blood_bank",
  "pharmacy",
  "doctors",
  "dentist",
  "other",
];

/** Nominatim's published policy: at most one request per second. */
const NOMINATIM_MIN_INTERVAL_MS = 1_100;
const NOMINATIM_TIMEOUT_MS = 15_000;
/**
 * Overpass is the fragile half of this integration. The public instances are
 * frequently at capacity, and a dense city query can take close to a minute, so
 * one attempt is not enough. See `queryOverpass` for how these are applied.
 */
const OVERPASS_ATTEMPTS = config.osm.overpassAttempts;
const OVERPASS_BACKOFF_MS = config.osm.overpassBackoffMs;
const OVERPASS_TIMEOUT_MS = config.osm.overpassTimeoutMs;
const OVERPASS_DEADLINE_MS = config.osm.overpassDeadlineMs;

const CACHE_TTL_MS = {
  geocode: 24 * 60 * 60 * 1000,
  reverse: 24 * 60 * 60 * 1000,
  facilities: 5 * 60 * 1000,
};
const CACHE_MAX_ENTRIES = 400;

/* ------------------------------------------------------------------ */
/* Response cache                                                      */
/* ------------------------------------------------------------------ */

const cache = new Map();

function cacheRead(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheWrite(key, value, ttlMs) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Exposed for tests: forget every cached provider response. */
export function clearFacilityCache() {
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* Nominatim client (rate-limited)                                     */
/* ------------------------------------------------------------------ */

/**
 * A single serial queue shared by every Nominatim call in this process. The
 * public service must never receive a burst, so a call waits until at least
 * `NOMINATIM_MIN_INTERVAL_MS` has passed since the previous one finished
 * starting. A deployment doing serious volume should self-host Nominatim or use
 * a commercial geocoder — see docs/INTEGRATIONS.md.
 */
let nominatimChain = Promise.resolve();
let lastNominatimStart = 0;

function scheduleNominatim(task) {
  const run = nominatimChain.then(async () => {
    const since = Date.now() - lastNominatimStart;
    if (since < NOMINATIM_MIN_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, NOMINATIM_MIN_INTERVAL_MS - since));
    }
    lastNominatimStart = Date.now();
    return task();
  });
  // Keep the chain alive even when one call rejects.
  nominatimChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function nominatimUrl(pathname) {
  const base = config.osm.nominatimUrl.replace(/\/+$/, "");
  return new URL(`${base}${pathname}`);
}

async function nominatimJson(pathname, params) {
  const url = nominatimUrl(pathname);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  try {
    response = await scheduleNominatim(() =>
      fetch(url, {
        headers: {
          // Nominatim requires an identifying agent. Never a browser UA.
          "User-Agent": config.osm.userAgent,
          Accept: "application/json",
          ...(config.osm.contactEmail
            ? { From: config.osm.contactEmail }
            : {}),
        },
        signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
      }),
    );
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new HttpError(
      504,
      timedOut
        ? "The OpenStreetMap geocoder did not respond in time. Please try again."
        : "The OpenStreetMap geocoder could not be reached.",
      timedOut ? "GEOCODER_TIMEOUT" : "GEOCODER_UNREACHABLE",
    );
  }

  if (response.status === 429 || response.status === 403) {
    throw new HttpError(
      429,
      "The public OpenStreetMap geocoder is rate-limiting this server. Please wait a moment and try again.",
      "GEOCODER_RATE_LIMITED",
    );
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      `The OpenStreetMap geocoder responded with status ${response.status}.`,
      "GEOCODER_ERROR",
    );
  }

  return response.json();
}

/** Turns a typed place — city, area, PIN code — into real coordinates. */
export async function geocodePlace(text) {
  const query = typeof text === "string" ? text.trim() : "";
  if (query.length < 2) {
    throw new HttpError(400, "Enter at least two characters of a place name or a PIN code.", "QUERY_TOO_SHORT");
  }

  const key = `geocode:${query.toLowerCase()}`;
  const cached = cacheRead(key);
  if (cached) return cached;

  const payload = await nominatimJson("/search", {
    q: query,
    format: "jsonv2",
    limit: 1,
    addressdetails: 1,
    "accept-language": "en",
  });

  const first = Array.isArray(payload) ? payload[0] : null;
  const latitude = Number(first?.lat);
  const longitude = Number(first?.lon);
  if (!first || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const result = {
    latitude,
    longitude,
    formatted: typeof first.display_name === "string" ? first.display_name : query,
    source: OSM_SOURCES.geocoder,
  };
  cacheWrite(key, result, CACHE_TTL_MS.geocode);
  return result;
}

/** Turns a device fix into a human-readable place, for labelling only. */
export async function reverseGeocodePoint(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new HttpError(400, "Valid latitude and longitude are required.", "VALIDATION");
  }

  const key = `reverse:${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cached = cacheRead(key);
  if (cached) return cached;

  const payload = await nominatimJson("/reverse", {
    lat: latitude,
    lon: longitude,
    format: "jsonv2",
    zoom: 14,
    "accept-language": "en",
  });

  const display = typeof payload?.display_name === "string" ? payload.display_name.trim() : "";
  const result = {
    latitude,
    longitude,
    formatted: display || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    source: OSM_SOURCES.geocoder,
  };
  cacheWrite(key, result, CACHE_TTL_MS.reverse);
  return result;
}

/* ------------------------------------------------------------------ */
/* Overpass client                                                     */
/* ------------------------------------------------------------------ */

/**
 * The Overpass query. `nwr` covers nodes, ways and relations in one clause, and
 * `out center` supplies a representative coordinate for ways and relations.
 * The result size is capped so a dense city cannot return an unbounded payload.
 */
function overpassQuery(latitude, longitude, radiusMeters, cap) {
  return `[out:json][timeout:25];
(
  nwr["amenity"~"^(hospital|clinic|doctors|pharmacy|dentist|health_post)$"](around:${radiusMeters},${latitude},${longitude});
  nwr["healthcare"~"^(hospital|clinic|doctor|pharmacy|dentist|centre|blood_donation)$"](around:${radiusMeters},${latitude},${longitude});
  nwr["amenity"="blood_bank"](around:${radiusMeters},${latitude},${longitude});
  nwr["healthcare:speciality"~"blood"](around:${radiusMeters},${latitude},${longitude});
);
out center tags ${cap};`;
}

/** Overpass reports a busy instance as a plain 429/502/503/504 — all retryable. */
const OVERPASS_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * Runs the Overpass query, retrying a busy or rate-limited instance.
 *
 * The public Overpass endpoints are shared infrastructure that is regularly at
 * capacity: a query that has to wait for a free worker comes back as a plain
 * `502`, and a dense city can legitimately take close to a minute to answer.
 * Treating either as a hard failure is what leaves the blood-bank panel empty,
 * so a fast 502 is retried after a short backoff.
 *
 * Every attempt shares one deadline and never exceeds the remaining budget, so
 * a retry loop can slow a request down but can never hang it. A 429 is honoured
 * via `Retry-After` rather than hammering the endpoint.
 */
async function queryOverpass(query) {
  const body = new URLSearchParams({ data: query }).toString();
  const deadline = Date.now() + OVERPASS_DEADLINE_MS;
  let lastError = null;

  for (let attempt = 1; attempt <= OVERPASS_ATTEMPTS; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    let response;
    try {
      response = await fetch(config.osm.overpassUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": config.osm.userAgent,
          Accept: "application/json",
          ...(config.osm.contactEmail ? { From: config.osm.contactEmail } : {}),
        },
        body,
        signal: AbortSignal.timeout(Math.min(OVERPASS_TIMEOUT_MS, remaining)),
      });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      lastError = new HttpError(
        timedOut ? 504 : 502,
        timedOut
          ? "The OpenStreetMap directory took too long to answer. Please try again in a moment."
          : "The OpenStreetMap directory could not be reached. Please try again in a moment.",
        timedOut ? "DIRECTORY_TIMEOUT" : "DIRECTORY_UNREACHABLE",
      );
      await sleep(Math.min(OVERPASS_BACKOFF_MS * attempt, deadline - Date.now()));
      continue;
    }

    if (response.ok) {
      const payload = await response.json().catch(() => null);
      return Array.isArray(payload?.elements) ? payload.elements : [];
    }

    if (!OVERPASS_RETRYABLE_STATUS.has(response.status)) {
      // A status like 400/413 is an answer about the request itself, not load.
      throw new HttpError(
        502,
        `The OpenStreetMap directory responded with status ${response.status}.`,
        "DIRECTORY_ERROR",
      );
    }

    const rateLimited = response.status === 429;
    lastError = new HttpError(
      rateLimited ? 429 : 503,
      rateLimited
        ? "The public OpenStreetMap directory is rate-limiting this server. Please wait a moment and try again."
        : "The public OpenStreetMap directory is busy right now. Please try again in a moment.",
      rateLimited ? "DIRECTORY_RATE_LIMITED" : "DIRECTORY_BUSY",
    );

    const retryAfter = Number.parseInt(response.headers.get("retry-after") || "", 10);
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : OVERPASS_BACKOFF_MS * attempt;
    if (wait >= deadline - Date.now()) break;
    await sleep(wait);
  }

  throw lastError ??
    new HttpError(
      503,
      "The public OpenStreetMap directory is busy right now. Please try again in a moment.",
      "DIRECTORY_BUSY",
    );
}

/* ------------------------------------------------------------------ */
/* Normalisation, classification and de-duplication                    */
/* ------------------------------------------------------------------ */

/** Reads the first present tag from a list of OpenStreetMap keys. */
function firstTag(tags, keys) {
  for (const key of keys) {
    const value = tags[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** The facility kind OpenStreetMap actually records — never a guess. */
function classify(tags, name) {
  const amenity = (tags.amenity || "").toLowerCase();
  const healthcare = (tags.healthcare || "").toLowerCase();
  const speciality = (tags["healthcare:speciality"] || "").toLowerCase();
  const lowered = (name || "").toLowerCase();

  if (
    amenity === "blood_bank" ||
    healthcare === "blood_donation" ||
    speciality.includes("blood") ||
    /\bblood\b/.test(lowered)
  ) {
    return "blood_bank";
  }
  if (amenity === "hospital" || healthcare === "hospital") return "hospital";
  if (amenity === "clinic" || healthcare === "clinic" || healthcare === "centre") return "clinic";
  if (amenity === "pharmacy" || healthcare === "pharmacy") return "pharmacy";
  if (amenity === "doctors" || healthcare === "doctor") return "doctors";
  if (amenity === "dentist" || healthcare === "dentist") return "dentist";
  return "other";
}

/** Builds a street address only from tags OpenStreetMap actually carries. */
function composeAddress(tags) {
  const explicit = firstTag(tags, ["addr:full"]);
  if (explicit) return explicit;
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"] || tags["addr:neighbourhood"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
    tags["addr:district"],
    tags["addr:postcode"],
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Normalises a raw OpenStreetMap element into a MEDIPAL facility record. */
export function normalizeElement(element) {
  const tags = element?.tags ?? {};
  const latitude = Number.isFinite(element?.lat) ? element.lat : element?.center?.lat;
  const longitude = Number.isFinite(element?.lon) ? element.lon : element?.center?.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const name = firstTag(tags, ["name", "name:en", "official_name", "operator"]);
  const address = composeAddress(tags);
  // A record with neither a name nor an address cannot be presented honestly.
  if (!name && !address) return null;

  const osmId = Number(element.id);
  const osmType = String(element.type || "node");

  return {
    id: `osm-${osmType}-${element.id}`,
    osmType,
    osmId,
    name,
    kind: classify(tags, name),
    category: firstTag(tags, ["healthcare", "amenity", "healthcare:speciality"]),
    address,
    city: firstTag(tags, ["addr:city", "addr:town", "addr:village"]),
    district: firstTag(tags, ["addr:district", "addr:subdistrict", "addr:county"]),
    state: firstTag(tags, ["addr:state", "addr:province"]),
    postalCode: firstTag(tags, ["addr:postcode"]),
    latitude,
    longitude,
    phone: firstTag(tags, ["phone", "contact:phone", "contact:mobile", "mobile"]),
    website: firstTag(tags, ["website", "contact:website", "url", "contact:url"]),
    openingHours: firstTag(tags, ["opening_hours"]),
    operator: firstTag(tags, ["operator"]),
    emergency: tags.emergency === "yes" || tags.emergency === "ambulance",
    source: OSM_SOURCES.directory,
    sourceUrl: `https://www.openstreetmap.org/${osmType}/${element.id}`,
  };
}

/** Great-circle distance in metres. */
export function distanceMeters(aLat, aLon, bLat, bLon) {
  const earthRadius = 6_371_000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * De-duplicates normalised records.
 *
 * OpenStreetMap sometimes maps the same hospital as both a node and a way.
 * Records are keyed by a rounded coordinate plus a case-folded name, so the two
 * collapse into one entry. The first record wins; later duplicates only
 * contribute a field the first one was missing, so nothing is fabricated and no
 * real value is overwritten by `null`.
 */
export function dedupeFacilities(records) {
  const byKey = new Map();
  for (const record of records) {
    if (!record) continue;
    const nameKey = (record.name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const key = `${nameKey}@${record.latitude.toFixed(4)},${record.longitude.toFixed(4)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      continue;
    }
    for (const field of ["phone", "website", "openingHours", "address", "operator", "category"]) {
      if (!existing[field] && record[field]) existing[field] = record[field];
    }
    existing.emergency = existing.emergency || record.emergency;
  }
  return [...byKey.values()];
}

/** Restricts results to the requested kinds, then attaches real distances. */
export function filterAndSort(records, { latitude, longitude, types, sortBy }) {
  const wanted = Array.isArray(types) && types.length ? new Set(types) : null;
  const scoped = wanted ? records.filter((record) => wanted.has(record.kind)) : records;
  const withDistance = scoped.map((record) => ({
    ...record,
    distanceMeters: distanceMeters(latitude, longitude, record.latitude, record.longitude),
  }));
  if (sortBy === "name") {
    withDistance.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  } else {
    withDistance.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
  return withDistance;
}

/* ------------------------------------------------------------------ */
/* Public search entry point                                           */
/* ------------------------------------------------------------------ */

export const facilityDirectoryReady = readiness.osm;

/**
 * Finds real healthcare facilities around a coordinate.
 *
 * `types` is an optional list of `FACILITY_KINDS`. `sortBy` is `distance`
 * (default) or `name`. Records missing a name *and* an address are dropped —
 * an anonymous pin would be noise, not a hospital.
 */
export async function searchFacilities({
  latitude,
  longitude,
  radiusMeters = 10_000,
  types = [],
  limit = 40,
  sortBy = "distance",
}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new HttpError(400, "Valid latitude and longitude are required.", "VALIDATION");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new HttpError(400, "That coordinate is outside the valid range.", "VALIDATION");
  }

  const radius = Math.min(Math.max(Number(radiusMeters) || 10_000, 500), 50_000);
  const max = Math.min(Math.max(Number(limit) || 40, 1), 80);
  const wanted = (Array.isArray(types) ? types : [])
    .map((type) => String(type).trim())
    .filter((type) => FACILITY_KINDS.includes(type));

  // Cache on a coarse grid so two nearby searches share one provider call.
  const key = `facilities:${latitude.toFixed(3)},${longitude.toFixed(3)},${radius}`;
  let elements = cacheRead(key);
  if (!elements) {
    elements = await queryOverpass(
      overpassQuery(latitude, longitude, radius, Math.min(Math.max(max * 4, 120), 400)),
    );
    cacheWrite(key, elements, CACHE_TTL_MS.facilities);
  }

  const normalized = elements.map(normalizeElement).filter(Boolean);
  const unique = dedupeFacilities(normalized);
  const ordered = filterAndSort(unique, { latitude, longitude, types: wanted, sortBy });

  return {
    origin: { latitude, longitude },
    facilities: ordered.slice(0, max),
    totalMatching: ordered.length,
    radiusMeters: radius,
    types: wanted,
    sortBy: sortBy === "name" ? "name" : "distance",
    attribution: OSM_ATTRIBUTION,
    sources: OSM_SOURCES,
    fetchedAt: new Date().toISOString(),
  };
}
