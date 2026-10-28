/**
 * E-UPCHAR API client.
 *
 * Communicates with the MEDIPAL backend to manage hospitals, services,
 * bookings, patients and the verified-price registry.
 *
 * The platform-admin key is accepted as an argument and attached per request.
 * It is never read from the bundle, never written to storage and never logged.
 */

import { API_BASE } from "@/services/eupchar/config";
import type {
  AdminAuditEntry,
  AdminPriceCounts,
  AdminPriceRecord,
  AdminSession,
  Booking,
  Hospital,
  HospitalService,
  Patient,
  Service,
  AppointmentSlot,
} from "@/types/eupchar";

export class EUpcharApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;

  constructor(status: number, message: string, code: string, detail?: unknown) {
    super(message);
    this.name = "EUpcharApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extraHeaders,
  };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
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
    throw new EUpcharApiError(
      response.status,
      record.error || `The E-UPCHAR service replied with ${response.status}.`,
      record.code || "REQUEST_FAILED",
      record.detail,
    );
  }
  return payload as T;
}

/** Attaches the operator-supplied platform-admin key to one request. */
function adminHeaders(adminKey: string): Record<string, string> {
  return { "x-medipal-admin-key": adminKey };
}

export type AdminPriceInput = {
  readonly hospitalId: string;
  readonly serviceId: string;
  readonly verificationStatus: string;
  readonly finalPayablePaise?: number | null;
  readonly taxesAndFeesPaise?: number | null;
  readonly sourceName?: string | null;
  readonly sourceUrl?: string | null;
  readonly sourceType?: string | null;
  readonly lastVerifiedOn?: string | null;
  readonly staleDetectedOn?: string | null;
  readonly statusNote?: string | null;
  readonly conditions?: string | null;
};

export const eupcharApi = {
  hospitals: (params: URLSearchParams) =>
    request<{ hospitals: Hospital[]; total: number; filters: any }>(`/api/e-upchar/hospitals?${params.toString()}`),

  hospital: (id: string) =>
    request<{ hospital: Hospital; services: HospitalService[] }>(`/api/e-upchar/hospitals/${encodeURIComponent(id)}`),

  service: (id: string) =>
    request<Service>(`/api/e-upchar/services/${encodeURIComponent(id)}`),

  slots: (params: URLSearchParams) =>
    request<{ slots: AppointmentSlot[] }>(`/api/e-upchar/slots?${params.toString()}`),

  createBooking: (body: any) =>
    request<{ booking: Booking }>(`/api/e-upchar/bookings`, { method: "POST", body: JSON.stringify(body) }),

  getBooking: (id: string) =>
    request<Booking>(`/api/e-upchar/bookings/${encodeURIComponent(id)}`),

  listPatients: () =>
    request<{ patients: Patient[] }>(`/api/e-upchar/patients`),

  createPatient: (body: any) =>
    request<Patient>(`/api/e-upchar/patients`, { method: "POST", body: JSON.stringify(body) }),

  /* ---------------------------------------------------------------- */
  /* Administration (Issue 3F). Every call needs the platform key and  */
  /* is authorised and audited server-side.                            */
  /* ---------------------------------------------------------------- */

  /** Safe to call without a key: reports whether the console is configured. */
  adminSession: () => request<AdminSession>(`/api/e-upchar/admin/session`),

  listAdminPrices: (adminKey: string, status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ prices: AdminPriceRecord[]; counts: AdminPriceCounts; filters: unknown }>(
      `/api/e-upchar/admin/prices${suffix}`,
      {},
      adminHeaders(adminKey),
    );
  },

  listAdminAudit: (adminKey: string) =>
    request<{ entries: AdminAuditEntry[] }>(`/api/e-upchar/admin/audit`, {}, adminHeaders(adminKey)),

  saveAdminPrice: (adminKey: string, input: AdminPriceInput) =>
    request<{ price: AdminPriceRecord }>(
      `/api/e-upchar/admin/service-prices`,
      { method: "POST", body: JSON.stringify(input) },
      adminHeaders(adminKey),
    ),

  markAdminPriceStale: (adminKey: string, body: { hospitalId: string; serviceId: string; staleDetectedOn?: string; statusNote?: string }) =>
    request<{ price: AdminPriceRecord }>(
      `/api/e-upchar/admin/service-prices/stale`,
      { method: "POST", body: JSON.stringify(body) },
      adminHeaders(adminKey),
    ),

  removeAdminPrice: (adminKey: string, body: { hospitalId: string; serviceId: string; reason?: string }) =>
    request<{ removed: boolean; hospitalId: string; serviceId: string }>(
      `/api/e-upchar/admin/service-prices/remove`,
      { method: "POST", body: JSON.stringify(body) },
      adminHeaders(adminKey),
    ),
};
