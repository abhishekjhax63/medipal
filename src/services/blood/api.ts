/**
 * MEDIPAL Blood Bank API client.
 *
 * Every call goes to the same-origin `/api/blood/*` routes that `server/blood.mjs`
 * serves, so no credential — neither the facility token nor the platform-admin
 * key — ever has to cross an untrusted origin. Responses are used as returned;
 * nothing here fabricates a figure, a success, or a fallback dataset.
 */

import { API_BASE } from "@/services/eupchar/config";
import type {
  AdminFacility,
  AdminSession,
  AdminStats,
  AuditEntry,
  AvailabilityResponse,
  BloodDataAdminResponse,
  BloodHealthResponse,
  BloodInfo,
  BloodRequestInput,
  BloodRequestResult,
  CentresResponse,
  ColdChainPassport,
  DirectoryFacility,
  DistrictsResponse,
  DonorRegistrationInput,
  DonorRegistrationResult,
  DonorSummary,
  EmergencyInfo,
  FacilityApplicationInput,
  FacilityApplicationResult,
  FacilityCardSort,
  FacilityCardsResponse,
  FacilityConsoleIdentity,
  FacilityInventoryDetailResponse,
  FacilityNotification,
  FacilityOpenRequest,
  FacilityStatus,
  FacilityTransfer,
  InventoryItem,
  InventoryMovement,
  NearbyCentresResponse,
  RequestStatus,
  SelfTestResult,
  SyncRunResult,
  SyncRunsResponse,
  TrackedRequest,
} from "@/services/blood/types";

/** A server response that was not `2xx`, carrying the code the server chose. */
export class BloodApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;

  constructor(status: number, message: string, code: string, detail?: unknown) {
    super(message);
    this.name = "BloodApiError";
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
  /** Facility bearer token. Sent only to `/api/blood/facility/*`. */
  facilityToken?: string;
  /** Platform-admin key. Sent only to `/api/blood/admin/*`. */
  adminKey?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.facilityToken) headers.Authorization = `Bearer ${options.facilityToken}`;
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
    throw new BloodApiError(
      0,
      "MEDIPAL could not reach its blood bank service. Check your connection and try again.",
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
    throw new BloodApiError(
      response.status,
      record.error || `The blood bank service replied with ${response.status}.`,
      record.code || "REQUEST_FAILED",
      record.detail,
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export const bloodApi = {
  info: (signal?: AbortSignal) => request<BloodInfo>("/api/blood/info", { signal }),

  emergency: (signal?: AbortSignal) => request<EmergencyInfo>("/api/blood/emergency", { signal }),

  facilities: (
    query?: { q?: string; status?: FacilityStatus; category?: string; state?: string; city?: string },
    signal?: AbortSignal,
  ) =>
    request<{ status: FacilityStatus; count: number; facilities: DirectoryFacility[]; note: string }>(
      "/api/blood/facilities",
      { query, signal },
    ),

  /** Stock figures reported by facilities, with freshness and provenance. */
  availability: (
    query?: {
      bloodGroup?: string;
      component?: string;
      state?: string;
      district?: string;
      city?: string;
      postalCode?: string;
      lat?: number;
      lng?: number;
      radiusKm?: number;
      freshness?: "all" | "verified_only" | "exclude_stale";
      sortBy?: "distance" | "freshness" | "quantity";
      limit?: number;
    },
    signal?: AbortSignal,
  ) => request<AvailabilityResponse>("/api/blood/availability", { query, signal }),

  /** Directory of real hospitals/blood banks from the maps provider. */
  nearby: (
    query: { city?: string; state?: string; facility?: string; lat?: number; lng?: number },
    signal?: AbortSignal,
  ) =>
    request<{
      area: { latitude: number; longitude: number; formatted: string };
      facilities: {
        id: string | null;
        name: string | null;
        address: string | null;
        categories: string[];
        distanceMeters: number | null;
        phone: string | null;
        kind?: "blood_service" | "facility";
      }[];
    }>("/api/blood/nearby", { query, signal }),

  registerDonor: (input: DonorRegistrationInput) =>
    request<DonorRegistrationResult>("/api/blood/donors", { method: "POST", body: input }),

  donorSummary: (
    query?: { bloodGroup?: string; state?: string; city?: string },
    signal?: AbortSignal,
  ) => request<DonorSummary>("/api/blood/donors/summary", { query, signal }),

  createRequest: (input: BloodRequestInput) =>
    request<BloodRequestResult>("/api/blood/requests", { method: "POST", body: input }),

  trackRequest: (reference: string, phone: string, signal?: AbortSignal) =>
    request<TrackedRequest>(`/api/blood/requests/${encodeURIComponent(reference.trim())}`, {
      query: { phone },
      signal,
    }),

  applyAsFacility: (input: FacilityApplicationInput) =>
    request<FacilityApplicationResult>("/api/blood/facilities/applications", {
      method: "POST",
      body: input,
    }),

  publicNotifications: (signal?: AbortSignal) =>
    request<{ notifications: { type: string; title: string; body: string; createdAt: string }[] }>(
      "/api/blood/notifications",
      { signal },
    ),

  // ---- Bihar live availability (§11-§13) -----------------------------------
  // Served by `server/blood/live-routes.mjs`. Freshness is decided server-side
  // from the source's own observation time; the browser only renders it.

  /** The 38 Bihar districts, for the district selector and map centring. */
  districts: (query?: { state?: string }, signal?: AbortSignal) =>
    request<DistrictsResponse>("/api/blood/districts", { query, signal }),

  /** Centres with their reported figures, provenance and freshness verdict. */
  centres: (
    query?: {
      district?: string;
      bloodGroup?: string;
      component?: string;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      sortBy?: "priority" | "emergency" | "distance" | "freshness";
      limit?: number;
    },
    signal?: AbortSignal,
  ) => request<CentresResponse>("/api/blood/centres", { query, signal }),

  /** Centres around a coordinate, ranked for an emergency. */
  liveNearby: (
    query: { latitude: number; longitude: number; bloodGroup?: string; component?: string; radiusKm?: number; limit?: number },
    signal?: AbortSignal,
  ) => request<NearbyCentresResponse>("/api/blood/nearby", { query, signal }),

  /** Which sources are configured, and how fresh their last delivery was. */
  health: (signal?: AbortSignal) => request<BloodHealthResponse>("/api/blood/health", { signal }),

  /**
   * One card per approved centre, with that centre's reported stock nested.
   * This is the facility-grain feed the blood-bank cards render; a centre that
   * has reported nothing still comes back, marked `not_reported`.
   */
  facilityCards: (
    query?: {
      state?: string;
      district?: string;
      bloodGroup?: string;
      component?: string;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      sortBy?: FacilityCardSort;
      limit?: number;
    },
    signal?: AbortSignal,
  ) => request<FacilityCardsResponse>("/api/blood/facilities/cards", { query, signal }),

  /** The full stock panel for one centre, addressed by its public reference. */
  facilityInventory: (reference: string, signal?: AbortSignal) =>
    request<FacilityInventoryDetailResponse>(
      `/api/blood/facilities/${encodeURIComponent(reference.trim())}/inventory`,
      { signal },
    ),
};

/**
 * Absolute URL of the availability change stream. Returned as a string rather
 * than an opened `EventSource` so the caller owns connect/close and can clean up
 * on unmount. Nothing is fabricated: a silent stream means nothing changed.
 */
export function liveStreamUrl(): string {
  return `${API_BASE}/api/blood/stream`;
}

// ---------------------------------------------------------------------------
// Facility console — every call is scoped by the bearer token, never by an id
// ---------------------------------------------------------------------------

export const facilityApi = {
  me: (token: string, signal?: AbortSignal) =>
    request<FacilityConsoleIdentity>("/api/blood/facility/me", { facilityToken: token, signal }),

  inventory: (token: string, signal?: AbortSignal) =>
    request<{ inventory: InventoryItem[] }>("/api/blood/facility/inventory", {
      facilityToken: token,
      signal,
    }),

  reportStock: (
    token: string,
    body: {
      bloodGroup: string;
      component: string;
      quantity: number;
      unit?: string;
      batchNumber?: string;
      collectionDate?: string;
      expiryDate?: string;
      storageLocation?: string;
      status?: string;
      notes?: string;
      reason: string;
    },
  ) =>
    request<{ item: InventoryItem; created: boolean; publishedAt: string }>(
      "/api/blood/facility/inventory",
      { method: "POST", body, facilityToken: token },
    ),

  adjustStock: (
    token: string,
    body: { inventoryId: string; movementType: string; quantity: number; reason: string },
  ) =>
    request<{ item: InventoryItem; movementRecorded: boolean }>("/api/blood/facility/inventory/adjust", {
      method: "POST",
      body,
      facilityToken: token,
    }),

  movements: (token: string, signal?: AbortSignal) =>
    request<{ movements: InventoryMovement[] }>("/api/blood/facility/movements", {
      facilityToken: token,
      signal,
    }),

  expiry: (token: string, signal?: AbortSignal) =>
    request<{ today: string; items: InventoryItem[] }>("/api/blood/facility/expiry", {
      facilityToken: token,
      signal,
    }),

  openRequests: (token: string, signal?: AbortSignal) =>
    request<{ scope: { state: string; city: string }; notice: string; requests: FacilityOpenRequest[] }>(
      "/api/blood/facility/requests",
      { facilityToken: token, signal },
    ),

  submitProposal: (
    token: string,
    body: { reference: string; unitsOffered: number; message?: string },
  ) =>
    request<{ proposal: { id: string; status: string; created_at: string }; requestStatus: RequestStatus }>(
      "/api/blood/facility/proposals",
      { method: "POST", body, facilityToken: token },
    ),

  transfers: (token: string, signal?: AbortSignal) =>
    request<{ transfers: FacilityTransfer[] }>("/api/blood/facility/transfers", {
      facilityToken: token,
      signal,
    }),

  createTransfer: (
    token: string,
    body: { toFacilityReference: string; bloodGroup: string; component: string; quantity: number; notes?: string },
  ) =>
    request<{ transfer: { id: string; status: string; requested_at: string } }>(
      "/api/blood/facility/transfers",
      { method: "POST", body, facilityToken: token },
    ),

  advanceTransfer: (token: string, body: { transferId: string; status: string }) =>
    request<{ transfer: { id: string; status: string } }>("/api/blood/facility/transfers/advance", {
      method: "POST",
      body,
      facilityToken: token,
    }),

  coldChain: (token: string, signal?: AbortSignal) =>
    request<{ passports: ColdChainPassport[] }>("/api/blood/facility/cold-chain", {
      facilityToken: token,
      signal,
    }),

  createPassport: (
    token: string,
    body: { targetMinCelsius: number; targetMaxCelsius: number; notes?: string },
  ) =>
    request<{ passport: { id: string; code: string; status: string } }>(
      "/api/blood/facility/cold-chain",
      { method: "POST", body, facilityToken: token },
    ),

  addObservation: (
    token: string,
    body: { passportId: string; tempCelsius: number; note?: string },
  ) =>
    request<{
      isExcursion: boolean;
      status: string;
      target: { min: number; max: number };
      tempCelsius: number;
      message: string;
    }>("/api/blood/facility/cold-chain/observations", { method: "POST", body, facilityToken: token }),

  notifications: (token: string, signal?: AbortSignal) =>
    request<{ notifications: FacilityNotification[] }>("/api/blood/facility/notifications", {
      facilityToken: token,
      signal,
    }),

  markNotificationRead: (token: string, notificationId: string) =>
    request<{ ok: boolean }>("/api/blood/facility/notifications/read", {
      method: "POST",
      body: { notificationId },
      facilityToken: token,
    }),
};

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

export const adminApi = {
  /** Deliberately unauthenticated so the console can report "not configured". */
  session: (signal?: AbortSignal) =>
    request<AdminSession>("/api/blood/admin/session", { signal }),

  facilities: (key: string, query?: { status?: FacilityStatus }, signal?: AbortSignal) =>
    request<{ facilities: AdminFacility[] }>("/api/blood/admin/facilities", {
      adminKey: key,
      query,
      signal,
    }),

  stats: (key: string, signal?: AbortSignal) =>
    request<{ stats: AdminStats; generatedAt: string }>("/api/blood/admin/stats", {
      adminKey: key,
      signal,
    }),

  audit: (key: string, query?: { limit?: number }, signal?: AbortSignal) =>
    request<{ entries: AuditEntry[] }>("/api/blood/admin/audit", { adminKey: key, query, signal }),

  selfTest: (key: string, signal?: AbortSignal) =>
    request<SelfTestResult>("/api/blood/admin/self-test", { adminKey: key, signal }),

  reviewFacility: (
    key: string,
    body: { facilityId: string; decision: FacilityStatus; notes?: string; dataSourceId?: string; verifiedOnSite?: boolean },
  ) =>
    request<{
      facility: { public_ref: string; status: FacilityStatus; name: string };
      credential: { token: string; hint: string } | null;
    }>("/api/blood/admin/facilities/review", { method: "POST", body, adminKey: key }),

  issueCredential: (key: string, body: { facilityId: string; label?: string }) =>
    request<{ token: string; hint: string; label: string }>("/api/blood/admin/facilities/credentials", {
      method: "POST",
      body,
      adminKey: key,
    }),

  revokeCredential: (key: string, body: { facilityId: string; hint: string }) =>
    request<{ revoked: number }>("/api/blood/admin/facilities/credentials/revoke", {
      method: "POST",
      body,
      adminKey: key,
    }),

  advanceRequest: (
    key: string,
    body: { reference: string; status: RequestStatus; note: string; supplyingFacilityReference?: string },
  ) =>
    request<{ request: { public_ref: string; status: RequestStatus; updated_at: string } }>(
      "/api/blood/admin/requests/status",
      { method: "POST", body, adminKey: key },
    ),

  // ---- Bihar live availability console (§17, §25) --------------------------

  /** Totals, provider health and scheduler state for `/admin/blood-data`. */
  bloodData: (key: string, signal?: AbortSignal) =>
    request<BloodDataAdminResponse>("/api/blood/admin/blood-data", { adminKey: key, signal }),

  /** The sync log, newest first, with per-record failures attached. */
  syncRuns: (key: string, query?: { limit?: number; provider?: string }, signal?: AbortSignal) =>
    request<SyncRunsResponse>("/api/blood/admin/sync-runs", { adminKey: key, query, signal }),

  /**
   * Runs one source's sync on demand. The source must be named — MEDIPAL will
   * not guess which feed an operator meant. Requires an authorised admin key.
   */
  runSync: (key: string, provider: string) =>
    request<SyncRunResult>("/api/blood/admin/sync/run", {
      method: "POST",
      query: { provider },
      adminKey: key,
    }),
};
