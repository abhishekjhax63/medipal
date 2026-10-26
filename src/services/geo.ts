/**
 * Browser client for MEDIPAL's server-side Geoapify proxy.
 *
 * No mapping credential is embedded in the bundle. These calls are used only
 * after a person actively asks to resolve a pickup location.
 */

import { API_BASE } from "@/services/eupchar/config";

export type ResolvedLocation = {
  latitude: number;
  longitude: number;
  formatted: string;
};

export class GeoApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "GeoApiError";
    this.status = status;
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new GeoApiError("MEDIPAL could not reach the address lookup service.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "MEDIPAL could not resolve this location.";
    throw new GeoApiError(message, response.status);
  }
  return payload as T;
}

export const geoApi = {
  reverseGeocode: (latitude: number, longitude: number, signal?: AbortSignal) =>
    request<ResolvedLocation>(
      `/api/geoapify/reverse?${new URLSearchParams({ lat: String(latitude), lon: String(longitude) })}`,
      signal,
    ),
};

/** A proxy URL used as an image source; it never includes the provider key. */
export function staticMapUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    w: "960",
    h: "360",
    zoom: "15",
  });
  return `${API_BASE}/api/geoapify/staticmap?${params}`;
}
