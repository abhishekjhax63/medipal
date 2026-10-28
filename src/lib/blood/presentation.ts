/**
 * Presentation helpers for the Blood Bank module.
 *
 * These translate server-issued states into honest, colour-coded copy. None of
 * them invents a value: when a figure is absent the helper returns a phrase
 * saying so, rather than substituting a zero.
 */

import type {
  AvailabilityStatus,
  FreshnessStatus,
  InventoryStatus,
  LiveFreshnessLevel,
  RequestStatus,
  FacilityStatus,
} from "@/services/blood/types";

// ---------------------------------------------------------------------------
// Bihar live availability (§5, §16)
// ---------------------------------------------------------------------------
// The server sends a freshness verdict per row. These helpers only choose words
// and colours for it — they never re-grade a figure from the reader's clock, so
// a device with a skewed clock cannot make stale stock look current.

/** Tailwind classes per fresh level. Green ONLY for genuinely LIVE data. */
export const LIVE_FRESHNESS_TONE: Record<LiveFreshnessLevel, string> = {
  LIVE: "border-ok/30 bg-ok/10 text-ok",
  RECENT: "border-warn/30 bg-warn/10 text-warn",
  STALE: "border-warn/25 bg-warn/[0.07] text-content-secondary",
  OUTDATED: "border-danger/25 bg-danger/[0.07] text-content-secondary",
  UNKNOWN: "border-line bg-white/60 text-content-secondary",
};

/** Dot colour for the small animated freshness indicator. */
export const LIVE_FRESHNESS_DOT: Record<LiveFreshnessLevel, string> = {
  LIVE: "bg-emerald-500",
  RECENT: "bg-amber-500",
  STALE: "bg-amber-600",
  OUTDATED: "bg-crimson",
  UNKNOWN: "bg-content-secondary/30",
};

export const LIVE_FRESHNESS_LABEL: Record<LiveFreshnessLevel, string> = {
  LIVE: "LIVE",
  RECENT: "Recent",
  STALE: "Stale",
  OUTDATED: "Outdated",
  UNKNOWN: "Not dated",
};

export const LIVE_FRESHNESS_EXPLANATION: Record<LiveFreshnessLevel, string> = {
  LIVE: "The source observed this within the last 30 minutes.",
  RECENT: "Reported 30-120 minutes ago. Worth a call before you travel.",
  STALE: "Last observed between 2 and 6 hours ago. Treat as an indication only.",
  OUTDATED: "Last observed more than 6 hours ago. Do not rely on this figure.",
  UNKNOWN:
    "The source did not date this figure, so MEDIPAL cannot say how current it is. It is not confirmed stock.",
};

/** True only for the level that may be presented as current (§5). */
export function isConfirmedStock(level: LiveFreshnessLevel): boolean {
  return level === "LIVE" || level === "RECENT";
}

/** The status the source itself reported, in plain words. */
export const AVAILABILITY_STATUS_LABEL: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Reported available",
  LOW: "Reported low",
  UNAVAILABLE: "None reported",
  UNKNOWN: "Status not stated",
};

export const AVAILABILITY_STATUS_TONE: Record<AvailabilityStatus, string> = {
  AVAILABLE: "border-ok/30 bg-ok/10 text-ok",
  LOW: "border-warn/30 bg-warn/10 text-warn",
  UNAVAILABLE: "border-line bg-white/70 text-content-secondary",
  UNKNOWN: "border-line bg-white/60 text-content-secondary",
};

/** Tailwind classes per freshness state — green only when genuinely fresh. */
export const FRESHNESS_TONE: Record<FreshnessStatus, string> = {
  recently_verified: "border-ok/30 bg-ok/10 text-ok",
  update_due: "border-warn/30 bg-warn/10 text-warn",
  no_stock: "border-line bg-white/70 text-content-secondary",
  stale_unconfirmed: "border-warn/25 bg-warn/[0.07] text-content-secondary",
  unconfirmed_directory: "border-line bg-white/60 text-content-secondary",
  not_reporting: "border-line bg-white/60 text-content-secondary",
};

export const FRESHNESS_LABEL: Record<FreshnessStatus, string> = {
  recently_verified: "Recently confirmed",
  update_due: "Update due",
  no_stock: "No stock of this group",
  stale_unconfirmed: "Not recently confirmed",
  unconfirmed_directory: "Directory entry — no blood bank listed",
  not_reporting: "Not reporting",
};

export const FRESHNESS_EXPLANATION: Record<FreshnessStatus, string> = {
  recently_verified:
    "A facility reported stock within the last few hours. This is the freshest MEDIPAL can show.",
  update_due:
    "The last stock report is getting old. Confirm by phone before you travel.",
  no_stock:
    "The facility is reporting stock and holds none of this group or component right now.",
  stale_unconfirmed:
    "MEDIPAL has no recent stock confirmation for this facility, so no figure is shown.",
  unconfirmed_directory:
    "This is a directory entry. It has not confirmed that it operates a blood bank.",
  not_reporting:
    "This facility is not currently approved to report stock on MEDIPAL.",
};

export const FRESHNESS_BASIS_LABEL: Record<string, string> = {
  facility_inventory_report: "figures reported for this exact group and component",
  facility_other_stock_report: "the facility is reporting other stock, this group is not held",
  no_stock_report: "no stock report has ever been received from this facility",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  created: "Recorded",
  sent_to_eligible: "Shared with matching facilities",
  under_review: "A facility is reviewing it",
  proposal_accepted: "A facility has accepted",
  proposal_rejected: "The offer was declined",
  dispatched: "Dispatched",
  received: "Received by the hospital",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const REQUEST_STATUS_EXPLANATION: Record<RequestStatus, string> = {
  created: "The request exists in MEDIPAL. Nothing has been sent anywhere yet.",
  sent_to_eligible: "Matching facilities can see it. No blood has been reserved.",
  under_review: "A facility is checking whether it can supply. Nothing is allocated yet.",
  proposal_accepted: "A facility has committed to supply. Confirm details with them by phone.",
  proposal_rejected: "The facility that offered cannot proceed. Other facilities may still respond.",
  dispatched: "Units have left the supplying facility.",
  received: "The hospital records receipt of the units.",
  closed: "The request has been completed and closed.",
  cancelled: "The request was cancelled and is no longer active.",
};

export const REQUEST_STATUS_TONE: Record<RequestStatus, string> = {
  created: "border-line bg-white/70 text-content-secondary",
  sent_to_eligible: "border-crimson/25 bg-blush text-crimson-soft",
  under_review: "border-warn/30 bg-warn/10 text-warn",
  proposal_accepted: "border-ok/30 bg-ok/10 text-ok",
  proposal_rejected: "border-warn/30 bg-warn/10 text-warn",
  dispatched: "border-ok/30 bg-ok/10 text-ok",
  received: "border-ok/30 bg-ok/10 text-ok",
  closed: "border-line bg-white/70 text-content-secondary",
  cancelled: "border-line bg-white/60 text-content-secondary",
};

export const FACILITY_STATUS_LABEL: Record<FacilityStatus, string> = {
  pending: "Pending review",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  quarantine: "Quarantine",
  expired: "Expired",
  approaching_expiry: "Approaching expiry",
};

export const INVENTORY_STATUS_TONE: Record<InventoryStatus, string> = {
  available: "border-ok/30 bg-ok/10 text-ok",
  reserved: "border-warn/30 bg-warn/10 text-warn",
  quarantine: "border-danger/30 bg-danger/10 text-danger",
  expired: "border-danger/30 bg-danger/10 text-danger",
  approaching_expiry: "border-warn/30 bg-warn/10 text-warn",
};

/**
 * Plain-language names for the provenance register, so a row can always say
 * where its number came from. Mirrors `blood_data_sources` (migration 002).
 */
export const DATA_SOURCE_LABEL: Record<string, string> = {
  eraktkosh: "e-RaktKosh (MoHFW) — no authorised public API",
  facility_self_report: "Reported by the facility itself — not independently verified",
  medipal_field_verified: "Verified by a MEDIPAL field visit",
  geoapify_directory: "Geoapify places directory (live lookup)",
  openstreetmap_tiles: "OpenStreetMap map tiles (live)",
};

/** Falls back to the raw id rather than inventing a friendly name. */
export function dataSourceLabel(id: string | null | undefined): string {
  if (!id) return "Source not recorded";
  return DATA_SOURCE_LABEL[id] ?? id;
}

// ---------------------------------------------------------------------------
// Centre verification
// ---------------------------------------------------------------------------
// Mirrors the `blood_centre_verification` enum. Only the two rungs that
// represent an actual check may be described as verified; `provider_authorized`
// says where the record came from, not that anybody inspected the centre.

export const CENTRE_VERIFICATION_LABEL: Record<string, string> = {
  unverified: "Not verified",
  provider_authorized: "From an authorised feed",
  field_verified: "Field-verified",
  centre_verified: "Verified centre",
  rejected: "Verification withdrawn",
};

export const CENTRE_VERIFICATION_TONE: Record<string, string> = {
  unverified: "border-line bg-white/70 text-content-secondary",
  provider_authorized: "border-crimson/25 bg-blush text-crimson-soft",
  field_verified: "border-ok/30 bg-ok/10 text-ok",
  centre_verified: "border-ok/30 bg-ok/10 text-ok",
  rejected: "border-danger/30 bg-danger/10 text-danger",
};

/** Never guesses a friendlier word than the record supports. */
export function centreVerificationLabel(value: string | null | undefined): string {
  if (!value) return "Verification not recorded";
  return CENTRE_VERIFICATION_LABEL[value] ?? "Verification not recorded";
}

export function centreVerificationTone(value: string | null | undefined): string {
  return (value && CENTRE_VERIFICATION_TONE[value]) || "border-line bg-white/70 text-content-secondary";
}

/** The line shown wherever live stock cannot be produced (§1). */
export const NO_LIVE_STOCK_COPY = "Live blood stock not available — contact the facility to confirm.";

/** Human "3 hours ago", computed on the reader's own clock. */
export function relativeTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "never";
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return "unknown";
  const seconds = Math.round((now - parsed) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  return `${Math.round(months / 12)} y ago`;
}

export function absoluteTime(value: string | null | undefined): string {
  if (!value) return "not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not recorded";
  return parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function dayLabel(value: string | null | undefined): string {
  if (!value) return "not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not recorded";
  return parsed.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

/** `4.2 km away`, or `null` when the origin was never supplied. */
export function formatDistance(km: number | null | undefined): string | null {
  if (typeof km !== "number" || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

/** Percentage of stock that is genuinely available, given expired units exist. */
export function formatQuantity(quantity: number | null | undefined, unit: string | null | undefined): string {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) return "not reported";
  return `${quantity} ${unit || "Units"}`;
}
