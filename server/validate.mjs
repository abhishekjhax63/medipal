/**
 * MEDIPAL · shared request-validation helpers.
 *
 * Extracted so the Blood Bank and Ambulance route modules validate input the
 * same way instead of each keeping a drifting private copy. Every helper either
 * returns a clean value or throws an `HttpError` naming the offending field —
 * a 400 that says which field is wrong, never a generic failure.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http.mjs";

export { HttpError };

export function text(value, field, { min = 0, max = 255, required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${field} is required.`, "VALIDATION");
    return null;
  }
  if (typeof value !== "string") throw new HttpError(400, `${field} must be text.`, "VALIDATION");
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new HttpError(400, `${field} must be at least ${min} characters.`, "VALIDATION");
  }
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters.`, "VALIDATION");
  }
  return trimmed;
}

export function oneOf(value, field, allowed, { required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${field} is required.`, "VALIDATION");
    return null;
  }
  if (!allowed.includes(value)) {
    throw new HttpError(400, `${field} must be one of: ${allowed.join(", ")}.`, "VALIDATION");
  }
  return value;
}

/** Normalises an Indian mobile number to its bare 10 digits. */
export function phone(value, field = "Contact number") {
  const raw = text(value, field, { min: 10, max: 20 });
  const digits = raw.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new HttpError(400, `${field} must be a 10-digit Indian mobile number.`, "VALIDATION");
  }
  return digits;
}

/**
 * Accepts any dialable telephone number, including an operator's landline or a
 * short official helpline such as 108. Deliberately looser than `phone()`.
 */
export function dialablePhone(value, field) {
  const raw = text(value, field, { min: 3, max: 20 });
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!/^\+?\d{3,15}$/.test(cleaned)) {
    throw new HttpError(400, `${field} must be a dialable telephone number.`, "VALIDATION");
  }
  return cleaned;
}

export function optionalEmail(value) {
  if (value === undefined || value === null || value === "") return null;
  const trimmed = text(value, "Email", { max: 200 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new HttpError(400, "Enter a valid email address.", "VALIDATION");
  }
  return trimmed;
}

export function postalCode(value) {
  if (value === undefined || value === null || value === "") return null;
  const trimmed = text(value, "PIN code", { max: 10 });
  if (!/^\d{6}$/.test(trimmed)) throw new HttpError(400, "PIN code must be 6 digits.", "VALIDATION");
  return trimmed;
}

export function integer(value, field, { min, max }) {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : value;
  if (!Number.isInteger(n)) throw new HttpError(400, `${field} must be a whole number.`, "VALIDATION");
  if (n < min || n > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max}.`, "VALIDATION");
  }
  return n;
}

export function optionalInteger(value, field, range) {
  if (value === undefined || value === null || value === "") return null;
  return integer(value, field, range);
}

export function coordinate(value, field, limit) {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} is not a valid coordinate.`, "VALIDATION");
  if (n < -limit || n > limit) {
    throw new HttpError(400, `${field} must be between -${limit} and ${limit}.`, "VALIDATION");
  }
  return n;
}

export function optionalCoordinate(value, field, limit) {
  if (value === undefined || value === null || value === "") return null;
  return coordinate(value, field, limit);
}

export function limitFrom(value, fallback = 60, max = 200) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

/** Constant-time comparison that never throws on length mismatch. */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
