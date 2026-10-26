/**
 * MEDIPAL Ambulance API client.
 *
 * Every call targets the same-origin `/api/ambulance/*` routes served by
 * `server/ambulance.mjs`. Responses are returned exactly as received — this
 * module never fabricates an availability figure, a fare, a driver, or a
 * dispatch confirmation. When a route answers with an error, the error is
 * surfaced with the server's own code so the UI can tell "nothing exists yet"
 * apart from "the service is down".
 */

import { API_BASE } from "@/services/eupchar/config";
import type {
  AmbulanceAuditEntry,
  AmbulanceAdminSession,
  AmbulanceAdminStats,
  AmbulanceBooking,
  AmbulanceBookingStatus,
  AmbulanceProviderStatus,
  AmbulanceEmergencyContact,
  AmbulanceInfo,
  BookingEventSource,
  BookingInput,
  BookingResult,
  CoverageDetailRow,
  EmergencyInfo,
  ProvidersResponse,
  TrackedBooking,
} from "@/services/ambulance/types";

/** A server response that was not `2xx`, carrying the code the server chose. */
export class AmbulanceApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;

  constructor(status: number, message: string, code: string, detail?: unknown) {
    super(message);
    this.name = "AmbulanceApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }

  /** True when the failure was "nothing is configured / reachable". */
  get isUnavailable(): boolean {
    return this.status === 503 || this.status === 502 || this.status === 504;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST";
  query?: Query;
  body?: unknown;
  /** Platform-admin key. Sent only to `/api/ambulance/admin/*`. */
  adminKey?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.adminKey) headers["x-medipal-admin-key"] = options.adminKey;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}${buildQuery(options.query)}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AmbulanceApiError(
      0,
      "MEDIPAL could not reach its ambulance service. Check your connection and try again.",
      "NETWORK_UNAVAILABLE",
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const record = (payload ?? {}) as { error?: string; code?: string; detail?: unknown };
    throw new AmbulanceApiError(
      response.status,
      record.error || `The ambulance service replied with ${response.status}.`,
      record.code || "REQUEST_FAILED",
      record.detail,
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export const ambulanceApi = {
  info: (signal?: AbortSignal) => request<AmbulanceInfo>("/api/ambulance/info", { signal }),

  emergency: (signal?: AbortSignal) =>
    request<EmergencyInfo>("/api/ambulance/emergency", { signal }),

  /** Providers that are approved and whose availability has actually been given. */
  providers: (
    query?: { category?: string; state?: string; district?: string; q?: string; limit?: number },
    signal?: AbortSignal,
  ) => request<ProvidersResponse>("/api/ambulance/providers", { query, signal }),

  coverage: (
    query?: { category?: string; state?: string; district?: string },
    signal?: AbortSignal,
  ) => request<{ coverage: CoverageDetailRow[] }>("/api/ambulance/coverage", { query, signal }),

  emergencyContacts: (signal?: AbortSignal) =>
    request<{ contacts: AmbulanceEmergencyContact[] }>("/api/ambulance/emergency", { signal }).then(
      (value) => value.contacts,
    ),

  createBooking: (input: BookingInput) =>
    request<BookingResult>("/api/ambulance/bookings", { method: "POST", body: input }),

  trackBooking: (reference: string, phone: string, signal?: AbortSignal) =>
    request<TrackedBooking>(`/api/ambulance/bookings/${encodeURIComponent(reference.trim())}`, {
      query: { phone },
      signal,
    }),

  cancelBooking: (reference: string, body: { phone: string; reason?: string }) =>
    request<{ booking: AmbulanceBooking; events: TrackedBooking["events"] }>(
      `/api/ambulance/bookings/${encodeURIComponent(reference.trim())}/cancel`,
      { method: "POST", body },
    ),
};

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

export const ambulanceAdminApi = {
  /** Deliberately unauthenticated so the console can report "not configured". */
  session: (signal?: AbortSignal) =>
    request<AmbulanceAdminSession>("/api/ambulance/admin/session", { signal }),

  stats: (key: string, signal?: AbortSignal) =>
    request<{ stats: AmbulanceAdminStats; generatedAt: string }>("/api/ambulance/admin/stats", {
      adminKey: key,
      signal,
    }),

  providers: (key: string, query?: { status?: AmbulanceProviderStatus }, signal?: AbortSignal) =>
    request<{ providers: import("@/services/ambulance/types").AdminAmbulanceProvider[] }>(
      "/api/ambulance/admin/providers",
      { adminKey: key, query, signal },
    ),

  createProvider: (
    key: string,
    body: {
      name: string;
      providerType: string;
      contactPhone: string;
      alternatePhone?: string;
      emergencyHotline?: string;
      email?: string;
      address?: string;
      city?: string;
      district?: string;
      state?: string;
      postalCode?: string;
      latitude?: number;
      longitude?: number;
      coordinatesVerified?: boolean;
      serviceArea?: string;
      operatingHours?: string;
      notes?: string;
    },
  ) =>
    request<{ provider: import("@/services/ambulance/types").AdminAmbulanceProvider }>(
      "/api/ambulance/admin/providers",
      { method: "POST", body, adminKey: key },
    ),

  reviewProvider: (
    key: string,
    body: {
      providerId: string;
      decision: AmbulanceProviderStatus;
      notes?: string;
      verifiedOnSite?: boolean;
    },
  ) =>
    request<{ provider: import("@/services/ambulance/types").AdminAmbulanceProvider }>(
      "/api/ambulance/admin/providers/review",
      { method: "POST", body, adminKey: key },
    ),

  upsertCoverage: (
    key: string,
    body: {
      providerId: string;
      category: string;
      availability: string;
      availabilitySource: string;
      baseFarePaise?: number | null;
      perKmPaise?: number | null;
      estimatedResponseMinutes?: number | null;
      notes?: string;
    },
  ) =>
    request<{ coverage: import("@/services/ambulance/types").ProviderCategoryCoverage }>(
      "/api/ambulance/admin/providers/coverage",
      { method: "POST", body, adminKey: key },
    ),

  updateTracking: (
    key: string,
    body: { providerId: string; trackingMode: string; dispatchIntegration?: string },
  ) =>
    request<{ provider: import("@/services/ambulance/types").AdminAmbulanceProvider }>(
      "/api/ambulance/admin/providers/tracking",
      { method: "POST", body, adminKey: key },
    ),

  bookings: (key: string, query?: { status?: AmbulanceBookingStatus; limit?: number }, signal?: AbortSignal) =>
    request<{ bookings: AmbulanceBooking[] }>("/api/ambulance/admin/bookings", {
      adminKey: key,
      query,
      signal,
    }),

  advanceBooking: (
    key: string,
    body: { reference: string; status: AmbulanceBookingStatus; source: BookingEventSource; note: string },
  ) =>
    request<{ booking: AmbulanceBooking; events: TrackedBooking["events"] }>(
      "/api/ambulance/admin/bookings/status",
      { method: "POST", body, adminKey: key },
    ),

  audit: (key: string, query?: { limit?: number }, signal?: AbortSignal) =>
    request<{ entries: AmbulanceAuditEntry[] }>("/api/ambulance/admin/audit", {
      adminKey: key,
      query,
      signal,
    }),
};
