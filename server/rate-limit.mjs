import { HttpError } from "./http.mjs";

/** Small in-process guard for sensitive public endpoints. Deployments that run
 * multiple instances should also enforce an equivalent gateway-level limit. */
const buckets = new Map();

export function enforceRateLimit(key, { windowMs = 5 * 60_000, max = 20 } = {}) {
  const now = Date.now();
  const bucket = (buckets.get(key) || []).filter((at) => now - at < windowMs);
  if (bucket.length >= max) {
    throw new HttpError(429, "Too many requests. Please wait a few minutes before trying again.", "RATE_LIMITED");
  }
  bucket.push(now);
  buckets.set(key, bucket);
}
