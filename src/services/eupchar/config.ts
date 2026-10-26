/**
 * E-UPCHAR integration configuration.
 *
 * Nothing here may hardcode a secret. Only publishable identifiers (such as a
 * Razorpay `key_id`) are ever read from a `VITE_*` variable — and even those are
 * read here, never scattered through components, so there is one auditable place
 * where frontend-exposed configuration lives.
 *
 * Provider secrets (AI, Razorpay secret, Geoapify) live on the MEDIPAL backend
 * and are reached only through same-origin `/api/*` routes.
 *
 * Any integration whose configuration is missing reports `not_configured`, and
 * the UI must show an honest unavailable state rather than pretending it works.
 * See `.env.example` and `.env.server.example` for the full list.
 */

import type { IntegrationMode, IntegrationReadiness } from "@/types/eupchar";

function readEnv(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const env = import.meta.env as unknown as Record<string, string | undefined>;

const CONFIGURED_API_BASE = readEnv(env.VITE_EUPCHAR_API_BASE);

/**
 * `same-origin` (or a lone `/`) means "the server that served this page", i.e.
 * relative `/api/...` requests. That is how MEDIPAL's own backend is reached in
 * both development (via the Vite proxy) and production.
 */
const SAME_ORIGIN = CONFIGURED_API_BASE === "same-origin" || CONFIGURED_API_BASE === "/";

export const EUPCHAR_API_BASE = CONFIGURED_API_BASE;

/** Publishable key only. The secret lives on the server and is never shipped. */
export const RAZORPAY_PUBLIC_KEY_ID = readEnv(env.VITE_EUPCHAR_RAZORPAY_KEY_ID);

/** Prefix applied to API paths. Empty for same-origin, so paths stay relative. */
export const API_BASE = SAME_ORIGIN ? "" : CONFIGURED_API_BASE;

/** True when a backend is reachable — either same-origin or an absolute base. */
export const isApiConnected = SAME_ORIGIN || CONFIGURED_API_BASE.length > 0;

function mode(configured: boolean, sandboxFlag: boolean): IntegrationMode {
  if (configured) return "live";
  if (sandboxFlag) return "sandbox";
  return "not_configured";
}

/**
 * Readiness mirrors what MEDIPAL can actually do right now.
 *
 *  - payments — live only when a backend is connected *and* a publishable key
 *    id is present, because only then can a real order be created and verified.
 *  - maps — live when the backend is connected, since geocoding, static maps
 *    and places all go through the server's Geoapify proxy.
 *  - scheduling — this build has no hospital diary integration, so slots are
 *    always practice-only. It is never reported as `live`.
 *  - reports — no diagnostic-report provider is connected.
 */
export const integrationReadiness: IntegrationReadiness = {
  apiBase: API_BASE,
  scheduling: mode(false, true),
  payments: mode(isApiConnected && Boolean(RAZORPAY_PUBLIC_KEY_ID), true),
  maps: mode(isApiConnected, false),
  reports: mode(false, false),
  practiceModeAvailable: true,
};

/** Convenience flag for components that draw a map through the Geoapify proxy. */
export const MAPS_ENABLED = integrationReadiness.maps === "live";

/** Server-issued timezone-independent booking policy flags. */
export const bookingPolicy = {
  /** A slot is held for this long while checkout is completed. */
  slotHoldMinutes: 10,
  /** Practice slots are 30 minutes. */
  practiceSlotMinutes: 30,
} as const;
