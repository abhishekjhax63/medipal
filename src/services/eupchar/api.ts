/**
 * E-UPCHAR API client.
 *
 * Communicates with the MEDIPAL backend to manage hospitals, services,
 * bookings, and patients.
 */

import { API_BASE } from "@/services/eupchar/config";
import type {
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
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
};
