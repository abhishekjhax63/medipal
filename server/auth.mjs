/**
 * Authentication boundary for sensitive E-UPCHAR routes.
 *
 * MEDIPAL's browser is deliberately unable to manufacture this identity. A
 * trusted authentication gateway validates Google/email/phone sessions and
 * signs the user id + timestamp before forwarding the request to this server.
 * That keeps user identifiers and roles server-derived instead of accepting a
 * browser-supplied `userId` or role header.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./env.mjs";
import { HttpError } from "./http.mjs";

const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function equal(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAuthenticatedUser(request) {
  if (!config.auth.gatewaySecret) {
    throw new HttpError(
      503,
      "Protected E-UPCHAR actions are unavailable until an identity gateway is configured.",
      "AUTH_NOT_CONFIGURED",
    );
  }
  const userId = String(request.headers["x-medipal-user-id"] || "");
  const timestamp = String(request.headers["x-medipal-auth-timestamp"] || "");
  const signature = String(request.headers["x-medipal-auth-signature"] || "");
  const at = Number(timestamp);
  if (!UUID.test(userId) || !Number.isSafeInteger(at) || Math.abs(Date.now() - at) > MAX_CLOCK_SKEW_MS) {
    throw new HttpError(401, "Your sign-in session is missing or expired.", "UNAUTHENTICATED");
  }
  const expected = createHmac("sha256", config.auth.gatewaySecret).update(`${userId}.${timestamp}`).digest("hex");
  if (!equal(signature, expected)) throw new HttpError(401, "Your sign-in session could not be verified.", "UNAUTHENTICATED");
  return { id: userId };
}
