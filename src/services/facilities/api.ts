/**
 * Browser client for MEDIPAL's OpenStreetMap facility search.
 *
 * Every call is same-origin and goes through the MEDIPAL server, which owns the
 * provider policy (caching, one-request-per-second Nominatim serialisation, an
 * identifying User-Agent). No provider credential exists in this bundle because
 * the OpenStreetMap services need none.
 */

import { API_BASE } from "@/services/eupchar/config";
import type {
  FacilityDirectoryStatus,
  FacilityKind,
  FacilitySearchResponse,
} from "@/services/facilities/types";

export class FacilityApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 0, code = "REQUEST_FAILED") {
    super(message);
    this.name = "FacilityApiError";
    this.status = status;
    this.code = code;
  }
}

type SearchParams = {
  /** A city, area or PIN code. Used when no coordinates are supplied. */
  query?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  types?: readonly FacilityKind[];
  sortBy?: "distance" | "name";
  limit?: number;
};

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new FacilityApiError(
      "MEDIPAL could not reach the facility directory. Check your connection and try again.",
      0,
      "NETWORK",
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = (payload ?? {}) as { error?: string; code?: string };
    throw new FacilityApiError(
      record.error || `The facility directory replied with status ${response.status}.`,
      response.status,
      record.code || "REQUEST_FAILED",
    );
  }
  return payload as T;
}

/**
 * Resolves the caller's device position once. Permission is requested only
 * after an explicit user action, and a denial never blocks manual entry.
 */
export function currentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new FacilityApiError("This browser cannot share a location.", 0, "GEOLOCATION_UNSUPPORTED"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      const message =
        error.code === error.PERMISSION_DENIED
          ? "Location permission was declined. Enter a city, area or PIN code instead."
          : "Your device could not provide a location. Enter a place manually instead.";
      reject(new FacilityApiError(message, 0, error.code === error.PERMISSION_DENIED ? "PERMISSION_DENIED" : "POSITION_UNAVAILABLE"));
    }, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000, ...options });
  });
}

export const facilityApi = {
  status: (signal?: AbortSignal) => request<FacilityDirectoryStatus>("/api/facilities/health", signal),

  /** Labels a device fix with a readable place name. Best-effort only. */
  reverse: (latitude: number, longitude: number, signal?: AbortSignal) =>
    request<{ latitude: number; longitude: number; formatted: string }>(
      `/api/facilities/reverse?${new URLSearchParams({ lat: String(latitude), lon: String(longitude) })}`,
      signal,
    ),

  search: (params: SearchParams, signal?: AbortSignal) => {
    const search = new URLSearchParams();
    if (params.query?.trim()) search.set("q", params.query.trim());
    if (Number.isFinite(params.latitude) && Number.isFinite(params.longitude)) {
      search.set("lat", String(params.latitude));
      search.set("lng", String(params.longitude));
    }
    if (params.radiusKm) search.set("radiusKm", String(params.radiusKm));
    if (params.types?.length) search.set("types", params.types.join(","));
    if (params.sortBy) search.set("sort", params.sortBy);
    if (params.limit) search.set("limit", String(params.limit));
    return request<FacilitySearchResponse>(`/api/facilities/search?${search.toString()}`, signal);
  },
};
