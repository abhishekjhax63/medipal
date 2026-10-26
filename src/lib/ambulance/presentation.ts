/**
 * Presentation helpers for the MEDIPAL Ambulance module.
 *
 * Everything here translates a server-issued state into honest copy or a
 * colour token. Nothing invents a figure: when a value is absent the helper
 * returns a phrase that says so, rather than substituting a zero or a guess.
 */

import { formatPaise } from "@/lib/eupchar/format";
import type {
  AmbulanceAvailability,
  AmbulanceBooking,
  AmbulanceBookingStatus,
  AmbulanceCategory,
  AmbulanceNeed,
  AvailabilitySource,
} from "@/services/ambulance/types";

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export const CATEGORY_META: Record<AmbulanceCategory, { short: string; blurb: string }> = {
  "Basic Life Support (BLS)": {
    short: "BLS",
    blurb: "Basic life support — oxygen and trained crew for stable patients who need monitoring en route.",
  },
  "Advanced Life Support (ALS)": {
    short: "ALS",
    blurb: "Advanced life support — a cardiac monitor, defibrillator and critical-care crew for unstable patients.",
  },
  "Patient Transport Vehicle (PTV)": {
    short: "PTV",
    blurb: "Patient transport — a non-emergency vehicle to move a stable patient between home and hospital.",
  },
  "Other Locally Available Service": {
    short: "Other",
    blurb: "A locally available service that does not fit the categories above. Confirm its capability with the operator.",
  },
};

export const NEED_LABEL: Record<AmbulanceNeed, string> = {
  wheelchair: "Wheelchair access",
  stretcher: "Stretcher / trolley",
  oxygen: "Oxygen support",
  cardiac_monitor: "Cardiac monitor",
  neonatal_incubator: "Neonatal incubator",
  trained_attendant: "Trained medical attendant",
  isolation: "Isolation / infection control",
};

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

export const AVAILABILITY_LABEL: Record<AmbulanceAvailability, string> = {
  available: "Reports available",
  limited: "Limited",
  unavailable: "Reports unavailable",
  unknown: "Not confirmed",
};

/** Only `available` is ever green — every other state is deliberately neutral. */
export const AVAILABILITY_TONE: Record<AmbulanceAvailability, string> = {
  available: "border-ok/30 bg-ok/10 text-ok",
  limited: "border-warn/30 bg-warn/10 text-warn",
  unavailable: "border-line bg-white/70 text-content-secondary",
  unknown: "border-line bg-white/70 text-content-secondary",
};

export const AVAILABILITY_SOURCE_LABEL: Record<AvailabilitySource, string> = {
  provider_declared: "the operator's own declaration",
  provider_dispatch_feed: "the operator's live dispatch feed",
  medipal_verified: "a MEDIPAL verification call",
  not_confirmed: "not confirmed",
};

/** `₹1,200` for integer paise, or `null` so the caller can show an honest gap. */
export function formatFarePaise(paise: number | null | undefined): string | null {
  return formatPaise(paise ?? null);
}

/* ------------------------------------------------------------------ */
/* Booking status                                                      */
/* ------------------------------------------------------------------ */

export const BOOKING_STATUS_LABEL: Record<AmbulanceBookingStatus, string> = {
  requested: "Request recorded",
  accepted: "Operator accepted",
  assigned: "Vehicle assigned",
  dispatched: "Vehicle dispatched",
  en_route: "On the way",
  arrived: "Arrived at pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  unable_to_fulfil: "Operator could not fulfil",
};

export const BOOKING_STATUS_TONE: Record<AmbulanceBookingStatus, string> = {
  requested: "border-warn/30 bg-warn/10 text-warn",
  accepted: "border-crimson/30 bg-blush text-crimson-soft",
  assigned: "border-crimson/30 bg-blush text-crimson-soft",
  dispatched: "border-crimson/40 bg-blush text-crimson-soft",
  en_route: "border-crimson/40 bg-blush text-crimson-soft",
  arrived: "border-crimson/50 bg-blush text-crimson-soft",
  completed: "border-ok/30 bg-ok/10 text-ok",
  cancelled: "border-line bg-white/70 text-content-secondary",
  unable_to_fulfil: "border-danger/30 bg-danger/10 text-danger",
};

/** True only once an operator (or their dispatch feed) has said so, not MEDIPAL. */
export function isOperatorConfirmed(status: AmbulanceBookingStatus): boolean {
  return ["accepted", "assigned", "dispatched", "en_route", "arrived", "completed"].includes(status);
}

export const REQUEST_ONLY_NOTE =
  "MEDIPAL records your request. It does not dispatch a vehicle — the operator does, and this " +
  "status only changes when their confirmation is recorded.";

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/** Compact "3 minutes ago" style label; `null` when there is no timestamp. */
export function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Local booking history                                               */
/* ------------------------------------------------------------------ */

/**
 * A small local index so the patient can find their own requests again.
 *
 * Only the reference, the contact number the patient themselves typed, and a
 * little context are kept — and only on the patient's own device. No token and
 * no credential is ever stored, and the whole list can be cleared by the
 * patient at any time. The server still requires BOTH the reference and the
 * number before it will return a booking, so this index grants no extra access.
 */
export interface StoredAmbulanceBooking {
  reference: string;
  phone: string;
  category: AmbulanceCategory;
  urgency: AmbulanceBooking["urgency"];
  createdAt: string;
}

const HISTORY_KEY = "medipal_ambulance_history_v1";
const HISTORY_LIMIT = 25;

function storageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function readAmbulanceHistory(): StoredAmbulanceBooking[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is StoredAmbulanceBooking => {
      if (!row || typeof row !== "object") return false;
      const candidate = row as Record<string, unknown>;
      return (
        typeof candidate.reference === "string" &&
        typeof candidate.phone === "string" &&
        typeof candidate.createdAt === "string"
      );
    });
  } catch {
    return [];
  }
}

export function rememberAmbulanceBooking(entry: StoredAmbulanceBooking): void {
  if (!storageAvailable()) return;
  try {
    const existing = readAmbulanceHistory().filter((row) => row.reference !== entry.reference);
    const next = [entry, ...existing].slice(0, HISTORY_LIMIT);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* A full or blocked storage must never break the booking flow. */
  }
}

export function forgetAmbulanceBooking(reference: string): void {
  if (!storageAvailable()) return;
  try {
    const next = readAmbulanceHistory().filter((row) => row.reference !== reference);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearAmbulanceHistory(): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
