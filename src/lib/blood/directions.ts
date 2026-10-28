/**
 * Telephone and map-directions helpers for the Blood Bank module.
 *
 * Two rules are enforced here so no component has to remember them:
 *
 *   1. A `tel:` link is built only from a number the source actually
 *      published. No number is ever assembled, padded or shared between
 *      facilities.
 *   2. A directions link carries only facts MEDIPAL holds — the facility's own
 *      coordinates, or failing that its published address. The origin is
 *      attached only when the visitor has actually granted a location; with no
 *      origin the maps provider uses the device's own position itself. MEDIPAL
 *      never states or implies that it has calculated a route.
 */

import { useCallback, useState } from "react";

/** Digits and a leading `+` only. Returns `null` when nothing usable is left. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.replace(/\D/g, "").length >= 6 ? `tel:${cleaned}` : null;
}

export interface DirectionsTarget {
  /** The facility's published coordinates, or `null` when it has none. */
  coordinates: [number, number] | null;
  /** A full published address, used only when there are no coordinates. */
  address: string | null;
  name: string;
}

/**
 * A Google Maps directions deep link, or `null` when the facility has neither a
 * coordinate nor an address — in which case the button must be disabled rather
 * than pointed at a guess.
 */
export function directionsUrl(
  target: DirectionsTarget,
  origin: [number, number] | null = null,
): string | null {
  const destination = target.coordinates
    ? `${target.coordinates[0]},${target.coordinates[1]}`
    : target.address?.trim() || null;
  if (!destination) return null;

  const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (origin) params.set("origin", `${origin[0]},${origin[1]}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export type OriginState = "idle" | "locating" | "granted" | "denied" | "unavailable";

export interface DirectionsOrigin {
  /** `null` until the visitor grants a location. Directions work without it. */
  origin: [number, number] | null;
  state: OriginState;
  /** Honest, non-blocking copy for whichever outcome occurred. */
  message: string | null;
  request: () => void;
  clear: () => void;
}

/**
 * Requests the device position once, on an explicit user action only. A denial
 * is never fatal: directions keep working with the destination alone, and the
 * message says so instead of pretending the location was obtained.
 */
export function useDirectionsOrigin(): DirectionsOrigin {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [state, setState] = useState<OriginState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unavailable");
      setMessage(
        "This browser cannot share a location. Directions still open in Google Maps — set your starting point there.",
      );
      return;
    }
    setState("locating");
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin([position.coords.latitude, position.coords.longitude]);
        setState("granted");
        setMessage(
          "Directions will start from your current position. It is used only inside the maps link you open — MEDIPAL does not store it.",
        );
      },
      (error) => {
        setOrigin(null);
        setState("denied");
        setMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was declined, so directions open without a starting point. Google Maps will use your device's own position."
            : "Your device could not determine a position, so directions open without a starting point. Google Maps will use your device's own position.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  }, []);

  const clear = useCallback(() => {
    setOrigin(null);
    setState("idle");
    setMessage(null);
  }, []);

  return { origin, state, message, request, clear };
}
