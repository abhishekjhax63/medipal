/**
 * MEDIPAL backend.
 *
 * A small, dependency-free Node HTTP server that:
 *  - proxies AI Doctor conversations to the configured provider (key server-side),
 *  - creates and verifies Razorpay payments (secret server-side),
 *  - proxies Geoapify geocoding, static maps and nearby-facility search,
 *  - searches real hospitals, clinics and blood services on OpenStreetMap
 *    (Nominatim geocoding + Overpass), used by the Blood Bank and E-UPCHAR
 *    sections,
 *  - reports which integrations are configured at `GET /api/health`,
 *  - serves the built frontend from `dist/` in production (SPA fallback).
 *
 * No provider key is ever returned to the browser.
 */

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { ROOT, config, readiness } from "./env.mjs";
import { sendJson, sendError, readJsonBody } from "./http.mjs";
import { aiCapabilities, aiConfigured, requestChat } from "./ai.mjs";
import { paymentsConfigured } from "./payments.mjs";
import { geoConfigured, geocode, reverseGeocode, staticMap, nearbyPlaces } from "./geo.mjs";
import {
  FACILITY_KINDS,
  OSM_ATTRIBUTION,
  OSM_SOURCES,
  facilityDirectoryReady,
  geocodePlace,
  reverseGeocodePoint,
  searchFacilities,
} from "./overpass.mjs";
import { handleBloodRoute } from "./blood.mjs";
import { handleLiveBloodRoute } from "./blood/live-routes.mjs";
import { startScheduler } from "./blood/scheduler.mjs";
import { handleAmbulanceRoute } from "./ambulance.mjs";
import { handleEupcharRoute } from "./eupchar.mjs";
import { databaseHealth } from "./db.mjs";
import { enforceRateLimit } from "./rate-limit.mjs";

const DIST_DIR = resolve(ROOT, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/**
 * Parses a numeric query parameter. Absent or blank values become `NaN`, so a
 * missing `lat`/`lng` is never silently read as the real coordinate (0, 0).
 */
function numberParam(value) {
  if (typeof value !== "string" || value.trim() === "") return Number.NaN;
  return Number(value);
}

/** Resolves a request path to a file inside `dist`, guarding against traversal. */
function resolveStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(DIST_DIR, safe);
  if (!candidate.startsWith(DIST_DIR + sep) && candidate !== DIST_DIR) return null;
  return candidate;
}

function serveStatic(request, response, urlPath) {
  if (!existsSync(DIST_DIR)) {
    sendJson(response, 503, {
      error:
        "The frontend has not been built yet. Run `npm run build`, then start the server again.",
    });
    return;
  }

  let filePath = resolveStaticPath(urlPath);
  const isAssetRequest = urlPath.startsWith("/assets/") || extname(urlPath) !== "";

  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback: unknown, extension-less routes return the app shell.
    if (isAssetRequest) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    filePath = resolve(DIST_DIR, "index.html");
    if (!existsSync(filePath)) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
  }

  const body = readFileSync(filePath);
  response.writeHead(200, {
    "Content-Type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

async function handleApi(request, response, url) {
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/health") {
    const database = await databaseHealth();
    sendJson(response, 200, {
      ok: true,
      integrations: {
        ai: aiConfigured ? "live" : "not_configured",
        payments: paymentsConfigured ? "live" : "not_configured",
        maps: geoConfigured ? "live" : "not_configured",
        facilityDirectory: facilityDirectoryReady ? "live" : "not_configured",
        bloodDatabase: database.status,
        bloodAdminConsole: readiness.bloodAdmin ? "live" : "not_configured",
        ambulanceDatabase: database.status,
        ambulanceConsole: readiness.ambulanceAdmin ? "live" : "not_configured",
        eupcharDatabase: database.status,
        eupcharAuthGateway: readiness.eupcharAuth ? "configured" : "not_configured",
      },
      database,
      bloodDataSources:
        "e-RaktKosh exposes no authorized public API; MEDIPAL does not circumvent its access control. " +
        "See GET /api/blood/sources for the full provenance register.",
      facilityDataSources:
        "Real hospitals, clinics and blood services come from OpenStreetMap " +
        "(Nominatim geocoding + Overpass directory). A mapped facility is not " +
        "evidence of blood stock, a service menu or a doctor.",
    });
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Real hospital & healthcare facility search (OpenStreetMap)        */
  /* ---------------------------------------------------------------- */
  /* OpenStreetMap is public and keyless, so this works without any    */
  /* credential. Nothing here is cached in the browser or invented:    */
  /* a tag the source does not carry is returned as null.              */

  if (path === "/api/facilities/health" && request.method === "GET") {
    sendJson(response, 200, {
      status: facilityDirectoryReady ? "live" : "not_configured",
      provider: "OpenStreetMap",
      geocoder: OSM_SOURCES.geocoder,
      directory: OSM_SOURCES.directory,
      attribution: OSM_ATTRIBUTION,
      facilityKinds: FACILITY_KINDS,
      policy:
        "Public services only. Responses are cached, Nominatim calls are serialised to one request per second, and no restricted site is scraped.",
    });
    return true;
  }

  if (path === "/api/facilities/geocode" && request.method === "GET") {
    const place = await geocodePlace(url.searchParams.get("q") || "");
    if (!place) {
      sendJson(response, 404, {
        error: "No place matched that name. Try a city, area or 6-digit PIN code.",
        code: "PLACE_NOT_FOUND",
      });
      return true;
    }
    sendJson(response, 200, { ...place, attribution: OSM_ATTRIBUTION });
    return true;
  }

  if (path === "/api/facilities/reverse" && request.method === "GET") {
    const place = await reverseGeocodePoint(
      numberParam(url.searchParams.get("lat")),
      numberParam(url.searchParams.get("lon")),
    );
    sendJson(response, 200, { ...place, attribution: OSM_ATTRIBUTION });
    return true;
  }

  if (path === "/api/facilities/search" && request.method === "GET") {
    // Protects the public OpenStreetMap services from a runaway client, and
    // keeps MEDIPAL inside their usage policy.
    enforceRateLimit(`facilities:${request.socket.remoteAddress || "unknown"}`, { max: 40 });
    const query = (url.searchParams.get("q") || "").trim();
    // Read the parameters as strings first: `Number(null)` is `0`, so a missing
    // `lat`/`lng` would otherwise be treated as a real (0, 0) coordinate.
    const latitude = numberParam(url.searchParams.get("lat"));
    const longitude = numberParam(url.searchParams.get("lng"));
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

    if (!hasCoordinates && !query) {
      sendJson(response, 400, {
        error: "Enter a city, area or PIN code — or share your location — so MEDIPAL knows where to look.",
        code: "AREA_REQUIRED",
      });
      return true;
    }

    // The place lookup happens first so its coordinates drive the directory
    // query. A failed lookup is reported as such; results are never invented.
    const origin = hasCoordinates
      ? { latitude, longitude, formatted: query || null, source: null }
      : await geocodePlace(query);

    if (!origin) {
      sendJson(response, 404, {
        error: `MEDIPAL could not place “${query}” on the map, so no facility search was run.`,
        code: "PLACE_NOT_FOUND",
      });
      return true;
    }

    const radiusKm = Number(url.searchParams.get("radiusKm"));
    const result = await searchFacilities({
      latitude: origin.latitude,
      longitude: origin.longitude,
      radiusMeters: Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm * 1000 : undefined,
      types: (url.searchParams.get("types") || "").split(",").filter(Boolean),
      limit: Number(url.searchParams.get("limit")),
      sortBy: url.searchParams.get("sort") === "name" ? "name" : "distance",
    });

    sendJson(response, 200, { ...result, origin, areaLabel: origin.formatted ?? null });
    return true;
  }

  if (path === "/api/ai/chat" && request.method === "POST") {
    enforceRateLimit(`ai:${request.socket.remoteAddress || "unknown"}`);
    // Encoded media is deliberately capped. The AI route validates every file
    // again before it reaches an external provider.
    const body = await readJsonBody(request, 30 * 1024 * 1024);
    const result = await requestChat(body.messages);
    sendJson(response, 200, result);
    return true;
  }

  // This feature manifest contains no provider/model identifier or secret. It
  // lets the browser avoid accepting media that this deployment cannot analyse.
  if (path === "/api/ai/capabilities" && request.method === "GET") {
    sendJson(response, 200, aiCapabilities);
    return true;
  }

  if (path === "/api/geoapify/geocode" && request.method === "GET") {
    const result = await geocode(url.searchParams.get("text") || "");
    if (!result) {
      sendJson(response, 404, { error: "No matching place was found." });
      return true;
    }
    sendJson(response, 200, result);
    return true;
  }

  if (path === "/api/geoapify/reverse" && request.method === "GET") {
    const result = await reverseGeocode(
      Number(url.searchParams.get("lat")),
      Number(url.searchParams.get("lon")),
    );
    if (!result) {
      sendJson(response, 404, { error: "No address was found for that location." });
      return true;
    }
    sendJson(response, 200, result);
    return true;
  }

  if (path === "/api/geoapify/staticmap" && request.method === "GET") {
    const image = await staticMap({
      latitude: Number(url.searchParams.get("lat")),
      longitude: Number(url.searchParams.get("lon")),
      width: Number(url.searchParams.get("w")),
      height: Number(url.searchParams.get("h")),
      zoom: Number(url.searchParams.get("zoom")),
    });
    response.writeHead(200, {
      "Content-Type": image.contentType,
      "Content-Length": image.buffer.length,
      "Cache-Control": "public, max-age=3600",
    });
    response.end(image.buffer);
    return true;
  }

  // Bihar live-availability endpoints (§11-§13, §17, §25). Checked BEFORE the
  // Geoapify directory branch below because both answer `/api/blood/nearby`:
  // this router answers only when a coordinate is supplied and otherwise
  // declines, letting a place-name search keep its directory listing.
  if (url.pathname.startsWith("/api/blood/")) {
    const handledLive = await handleLiveBloodRoute(request, response, url);
    if (handledLive) return true;
  }

  if (path === "/api/blood/nearby" && request.method === "GET") {
    const city = (url.searchParams.get("city") || "").trim();
    const state = (url.searchParams.get("state") || "").trim();
    const facility = (url.searchParams.get("facility") || "").trim();
    const centreQuery =
      (city && `${city}, ${state ? `${state}, ` : ""}India`) ||
      (state && `${state}, India`) ||
      (facility && `${facility}, India`) ||
      "";
    if (!centreQuery) {
      sendJson(response, 400, { error: "Enter a city or state to search nearby." });
      return true;
    }
    const area = await geocode(centreQuery);
    if (!area) {
      sendJson(response, 404, { error: "That place could not be located." });
      return true;
    }
    let facilities = await nearbyPlaces({
      latitude: area.latitude,
      longitude: area.longitude,
      radiusMeters: 25_000,
      limit: 20,
    });
    if (facility) {
      const needle = facility.toLowerCase();
      const filtered = facilities.filter((place) =>
        `${place.name ?? ""} ${place.address ?? ""}`.toLowerCase().includes(needle),
      );
      if (filtered.length > 0) facilities = filtered;
    }
    sendJson(response, 200, { area, facilities });
    return true;
  }

  // Blood Bank module (donor registry, availability, requests, facility console).
  // Delegated so this file keeps owning only the shared integrations.
  if (path.startsWith("/api/blood/")) {
    const handled = await handleBloodRoute(request, response, url);
    if (handled) return true;
  }

  // Ambulance module (provider network, booking requests, operator console).
  // Shares the platform-admin key with the Blood Bank console so the platform
  // team manages one credential, not several.
  if (path.startsWith("/api/ambulance/")) {
    const handled = await handleAmbulanceRoute(request, response, url);
    if (handled) return true;
  }

  // E-UPCHAR module (hospital discovery, diagnostics booking and patient management).
  if (path.startsWith("/api/e-upchar/")) {
    const handled = await handleEupcharRoute(request, response, url);
    if (handled) return true;
  }

  return false;
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    void (async () => {
      try {
        const handled = await handleApi(request, response, url);
        if (!handled) sendJson(response, 404, { error: "Unknown API route." });
      } catch (error) {
        sendError(response, error);
      }
    })();
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response, url.pathname);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed." });
});

server.listen(config.port, () => {
  const status = (flag) => (flag ? "live" : "not_configured");
  // Log only integration *status*, never any credential value.
  console.log(
    `MEDIPAL server listening on http://localhost:${config.port}  ·  ` +
      `ai=${status(readiness.ai)} payments=${status(readiness.payments)} maps=${status(readiness.maps)}`,
  );
  // Starts the recurring Bihar availability sync. It is a no-op read until an
  // authorised provider is configured, so it never invents stock (§2, §21).
  startScheduler();
});
