/**
 * Server-side configuration loader.
 *
 * Loads `.env` (frontend preview values) and `.env.server` (secrets) into
 * `process.env` without overriding anything already set in the real
 * environment — so a hosting platform's dashboard variables always win.
 *
 * SECURITY: nothing in this file is ever sent to the browser. Provider keys
 * (AI, Razorpay secret, Geoapify) live only here and in `.env.server`, which is
 * git-ignored. The client never receives them; it talks to this server instead.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Repository root (one level above `server/`). */
export const ROOT = resolve(here, "..");

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

function loadFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return {};
  try {
    return parseEnvFile(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

// `.env.server` (secrets) takes precedence over `.env` (public preview values),
// and both defer to the ambient process environment.
const merged = { ...loadFile(".env"), ...loadFile(".env.server") };
for (const [key, value] of Object.entries(merged)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const read = (key) => (typeof process.env[key] === "string" ? process.env[key].trim() : "");

/**
 * Reads an integer with a floor and a ceiling. An unparseable or out-of-range
 * value falls back to the documented default rather than propagating NaN into a
 * threshold — a broken env var must never silently change how freshness is
 * judged.
 */
const int = (key, fallback, min, max) => {
  const parsed = Number.parseInt(read(key), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
};

export const config = {
  port: Number.parseInt(read("PORT") || "8787", 10),
  ai: {
    baseUrl: read("AI_BASE_URL").replace(/\/+$/, ""),
    apiKey: read("AI_API_KEY"),
    model: read("AI_MODEL"),
    /** Explicit capability switches; a model is never assumed to accept media. */
    supportsImages: read("AI_SUPPORTS_IMAGES").toLowerCase() === "true",
    supportsVideoFrames: read("AI_SUPPORTS_VIDEO_FRAMES").toLowerCase() === "true",
    ffmpegPath: read("FFMPEG_PATH") || "ffmpeg",
    ffprobePath: read("FFPROBE_PATH") || "ffprobe",
  },
  razorpay: {
    keyId: read("RAZORPAY_KEY_ID"),
    keySecret: read("RAZORPAY_KEY_SECRET"),
  },
  geoapify: {
    apiKey: read("GEOAPIFY_API_KEY"),
  },
  database: {
    /** Least-privilege role used by the running server (RLS applies). */
    url: read("DATABASE_URL"),
    /** Superuser URL, used ONLY by `npm run db:setup`. Never by the server. */
    adminUrl: read("DATABASE_ADMIN_URL"),
  },
  blood: {
    /** Platform-admin key for the Blood Bank network console. */
    adminKey: read("BLOOD_ADMIN_KEY"),
    /** Minutes between scheduled Bihar availability synchronisations. */
    syncIntervalMinutes: int("BLOOD_SYNC_INTERVAL_MINUTES", 15, 1, 1440),
    /** Freshness ladder. 0-30 min LIVE, 30-120 RECENT, 120-360 STALE, 360+ OUTDATED. */
    liveThresholdMinutes: int("BLOOD_LIVE_THRESHOLD_MINUTES", 30, 1, 10080),
    recentThresholdMinutes: int("BLOOD_RECENT_THRESHOLD_MINUTES", 120, 1, 10080),
    staleThresholdMinutes: int("BLOOD_STALE_THRESHOLD_MINUTES", 360, 1, 43200),
    /**
     * Used ONLY when a provider reports plain units and no status of its own.
     * When a provider states a status, that status is copied verbatim instead.
     */
    lowUnitsThreshold: int("BLOOD_LOW_UNITS_THRESHOLD", 3, 0, 1000),
    /** A source with no successful sync for this long is reported DEGRADED. */
    providerDegradedMinutes: int("BLOOD_PROVIDER_DEGRADED_MINUTES", 60, 1, 43200),
    /** ... and for this long, OFFLINE. */
    providerOfflineMinutes: int("BLOOD_PROVIDER_OFFLINE_MINUTES", 360, 1, 43200),
    /** Retry policy for provider HTTP calls. Exponential backoff, never a hot loop. */
    providerAttempts: int("BLOOD_PROVIDER_ATTEMPTS", 3, 1, 6),
    providerBackoffMs: int("BLOOD_PROVIDER_BACKOFF_MS", 700, 50, 30000),
    providerTimeoutMs: int("BLOOD_PROVIDER_TIMEOUT_MS", 12000, 1000, 120000),
    /** Record cap per run, so a runaway provider cannot exhaust memory. */
    maxRecordsPerRun: int("BLOOD_SYNC_MAX_RECORDS", 20000, 1, 500000),
  },
  eraktkosh: {
    /**
     * The official authorised e-RaktKosh integration. Nothing is assumed:
     * a base URL alone is not enough — the deployment must also be told which
     * paths and auth header the issued credentials expect. No path is ever
     * guessed by MEDIPAL.
     */
    baseUrl: read("ERAKTKOSH_API_BASE_URL").replace(/\/+$/, ""),
    apiKey: read("ERAKTKOSH_API_KEY"),
    apiSecret: read("ERAKTKOSH_API_SECRET"),
    centresPath: read("ERAKTKOSH_CENTRES_PATH"),
    availabilityPath: read("ERAKTKOSH_AVAILABILITY_PATH"),
    districtsPath: read("ERAKTKOSH_DISTRICTS_PATH"),
    authHeader: read("ERAKTKOSH_AUTH_HEADER") || "Authorization",
    authScheme: read("ERAKTKOSH_AUTH_SCHEME") || "Bearer",
  },
  auth: {
    /** Shared only with a trusted identity gateway, never a browser. */
    gatewaySecret: read("EUPCHAR_AUTH_GATEWAY_SECRET"),
  },
};

export const readiness = {
  ai: Boolean(config.ai.baseUrl && config.ai.apiKey && config.ai.model),
  payments: Boolean(config.razorpay.keyId && config.razorpay.keySecret),
  maps: Boolean(config.geoapify.apiKey),
  blood: Boolean(config.database.url),
  bloodAdmin: Boolean(config.blood.adminKey),
  /** Ambulance shares the blood-bank database and platform-admin key. */
  ambulance: Boolean(config.database.url),
  ambulanceAdmin: Boolean(config.blood.adminKey),
  eupcharAuth: Boolean(config.auth.gatewaySecret),
  /**
   * True only when the official e-RaktKosh integration has been issued an
   * authorised base URL AND the paths those credentials expect. MEDIPAL never
   * guesses an endpoint, so this stays false until an operator supplies all of
   * them.
   */
  eraktkosh: Boolean(
    config.eraktkosh.baseUrl &&
      config.eraktkosh.apiKey &&
      config.eraktkosh.centresPath &&
      config.eraktkosh.availabilityPath,
  ),
};
