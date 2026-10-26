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
};
