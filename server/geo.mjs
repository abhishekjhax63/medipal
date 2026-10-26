/**
 * Geoapify proxy (maps & places).
 *
 * The browser never sees the Geoapify key. It calls these same-origin routes and
 * this module attaches the key server-side:
 *
 *  - `geocode(text)`        → approximate coordinates for a place name.
 *  - `reverseGeocode(...)`  → a human-readable address for a device fix.
 *  - `staticMap(...)`       → a map image centred on those coordinates.
 *  - `nearbyPlaces(...)`    → real facilities (blood banks / hospitals) near a
 *                             point, used by the Blood Bank availability search.
 *
 * Honesty note: a maps provider can tell you *where* blood-service facilities
 * are, but it cannot tell you how many units of each group they hold. So the
 * Blood Bank search surfaces real nearby facilities — never invented stock.
 */

import { config, readiness } from "./env.mjs";

export const geoConfigured = readiness.maps;

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Geoapify's taxonomy has no dedicated "blood bank" category, so MEDIPAL runs
 * two passes and merges them:
 *
 *  1. a name search for "blood" across the healthcare tree — this is what finds
 *     real blood banks and blood-donation centres, and
 *  2. a category search for hospitals and clinics, which are the facilities
 *     that typically run a licensed blood service.
 *
 * Results are de-duplicated by place id with the blood-specific matches first.
 */
export const BLOOD_NAME_HINT = "blood";
export const FACILITY_CATEGORIES = "healthcare.hospital,healthcare.clinic_or_praxis";
const HEALTHCARE_ROOT = "healthcare";

function key() {
  if (!geoConfigured) {
    const error = new Error("Maps are not configured on the server.");
    error.statusCode = 503;
    throw error;
  }
  return config.geoapify.apiKey;
}

/** Geocodes a free-text place (restricted to India) to approximate coordinates. */
export async function geocode(text) {
  const query = typeof text === "string" ? text.trim() : "";
  if (!query) {
    const error = new Error("A place to look up is required.");
    error.statusCode = 400;
    throw error;
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", query);
  url.searchParams.set("filter", "countrycode:in");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", key());

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    const error = new Error(`The geocoding service responded with status ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const first = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!first || typeof first.lat !== "number" || typeof first.lon !== "number") {
    return null;
  }
  return {
    latitude: first.lat,
    longitude: first.lon,
    formatted: typeof first.formatted === "string" ? first.formatted : query,
  };
}

/**
 * Resolves a browser position to a display address. This is deliberately a
 * one-off lookup: MEDIPAL never sends a continuous device-location stream to
 * the mapping provider. Callers must still let the person review or replace
 * the returned address before it is used as an ambulance pickup point.
 */
export async function reverseGeocode(latitude, longitude) {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    const error = new Error("Valid latitude and longitude are required.");
    error.statusCode = 400;
    throw error;
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", key());

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    const error = new Error("The address lookup service could not be reached.");
    error.statusCode = 502;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`The address lookup service responded with status ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const first = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!first || typeof first.formatted !== "string" || !first.formatted.trim()) return null;
  return { latitude, longitude, formatted: first.formatted.trim() };
}

/** Fetches a static map image centred on a point and returns its bytes. */
export async function staticMap({ latitude, longitude, width, height, zoom }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error("Valid latitude and longitude are required.");
    error.statusCode = 400;
    throw error;
  }

  const safeWidth = Math.min(Math.max(Number(width) || 640, 120), 1280);
  const safeHeight = Math.min(Math.max(Number(height) || 320, 120), 1280);
  const safeZoom = Math.min(Math.max(Number(zoom) || 12, 3), 18);

  const url = new URL("https://maps.geoapify.com/v1/staticmap");
  url.searchParams.set("style", "osm-bright");
  url.searchParams.set("width", String(safeWidth));
  url.searchParams.set("height", String(safeHeight));
  url.searchParams.set("center", `lonlat:${longitude},${latitude}`);
  url.searchParams.set("zoom", String(safeZoom));
  // The marker colour uses a literal `#`; URLSearchParams encodes it to `%23`
  // exactly once. Pre-encoding it here would double-encode and the API rejects it.
  url.searchParams.set("marker", `lonlat:${longitude},${latitude};color:#e91e4d;size:medium`);
  url.searchParams.set("apiKey", key());

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(
      `The map service responded with status ${response.status}.${
        detail ? ` ${detail.slice(0, 180)}` : ""
      }`,
    );
    error.statusCode = 502;
    throw error;
  }

  return {
    contentType: response.headers.get("content-type") || "image/png",
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

/**
 * Finds real blood-service facilities near a point. Returns neutral facility
 * data only — name, address, distance and contact where the provider supplies
 * it — and never a stock or availability figure.
 */
export async function nearbyPlaces({ latitude, longitude, radiusMeters, limit }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error("Valid latitude and longitude are required.");
    error.statusCode = 400;
    throw error;
  }

  const radius = Math.min(Math.max(Number(radiusMeters) || 10_000, 500), 50_000);
  const max = Math.min(Math.max(Number(limit) || 20, 1), 40);

  const [bloodMatches, facilities] = await Promise.all([
    queryPlaces({
      latitude,
      longitude,
      radius,
      limit: max,
      categories: HEALTHCARE_ROOT,
      name: BLOOD_NAME_HINT,
    }),
    queryPlaces({
      latitude,
      longitude,
      radius,
      limit: max,
      categories: FACILITY_CATEGORIES,
    }),
  ]);

  const merged = [];
  const seen = new Set();
  for (const place of [...bloodMatches, ...facilities]) {
    const dedupeKey = place.id ?? `${place.name}|${place.address}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    merged.push({
      ...place,
      kind: isBloodNamed(place.name) ? "blood_service" : "facility",
    });
  }

  return merged.slice(0, max);
}

function isBloodNamed(name) {
  return typeof name === "string" && name.toLowerCase().includes(BLOOD_NAME_HINT);
}

/** One Geoapify places query; returns neutral, normalised facility objects. */
async function queryPlaces({ latitude, longitude, radius, limit, categories, name }) {
  const url = new URL("https://api.geoapify.com/v2/places");
  url.searchParams.set("categories", categories);
  url.searchParams.set("filter", `circle:${longitude},${latitude},${radius}`);
  url.searchParams.set("bias", `proximity:${longitude},${latitude}`);
  url.searchParams.set("limit", String(limit));
  if (name) url.searchParams.set("name", name);
  url.searchParams.set("apiKey", key());

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    const error = new Error(`The places service responded with status ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const features = Array.isArray(payload?.features) ? payload.features : [];

  return features
    .map((feature) => {
      const properties = feature?.properties ?? {};
      const distance = typeof properties.distance === "number" ? properties.distance : null;
      return {
        id: typeof properties.place_id === "string" ? properties.place_id : null,
        name: typeof properties.name === "string" ? properties.name : null,
        address:
          typeof properties.formatted === "string"
            ? properties.formatted
            : typeof properties.address_line2 === "string"
              ? properties.address_line2
              : null,
        categories: Array.isArray(properties.categories) ? properties.categories : [],
        distanceMeters: distance,
        phone:
          typeof properties.datasource?.raw?.phone === "string"
            ? properties.datasource.raw.phone
            : null,
      };
    })
    .filter((place) => place.name || place.address);
}
