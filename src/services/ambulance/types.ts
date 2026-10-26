/**
 * MEDIPAL Ambulance module — shared types.
 *
 * These mirror exactly what `server/ambulance.mjs` returns. Nothing here invents
 * a field: if the server does not send it, the type does not claim it. Fares are
 * integer paise (never a float rupee) and every availability claim carries the
 * timestamp and source the operator gave it with, so the UI can be honest about
 * how old — or unconfirmed — a figure is.
 */

export const AMBULANCE_CATEGORIES = [
  "Basic Life Support (BLS)",
  "Advanced Life Support (ALS)",
  "Patient Transport Vehicle (PTV)",
  "Other Locally Available Service",
] as const;

export type AmbulanceCategory = (typeof AMBULANCE_CATEGORIES)[number];

export const AMBULANCE_NEEDS = [
  "wheelchair",
  "stretcher",
  "oxygen",
  "cardiac_monitor",
  "neonatal_incubator",
  "trained_attendant",
  "isolation",
] as const;

export type AmbulanceNeed = (typeof AMBULANCE_NEEDS)[number];

export type AmbulanceUrgency = "emergency" | "non_emergency";

export type AmbulanceAvailability = "available" | "limited" | "unavailable" | "unknown";

export type AmbulanceProviderStatus = "pending" | "under_review" | "approved" | "rejected" | "suspended";

export type AmbulanceBookingStatus =
  | "requested"
  | "accepted"
  | "assigned"
  | "dispatched"
  | "en_route"
  | "arrived"
  | "completed"
  | "cancelled"
  | "unable_to_fulfil";

export type AvailabilitySource =
  | "provider_declared"
  | "provider_dispatch_feed"
  | "medipal_verified"
  | "not_confirmed";

export type TrackingMode = "phone_only" | "provider_portal" | "provider_dispatch_feed";

export type PickupSource = "browser_geolocation" | "manual" | "geocoded" | "map_pin";

export type BookingEventSource =
  | "medipal"
  | "provider_dispatch_feed"
  | "provider_phone_confirmation"
  | "patient";

export interface ProviderCategoryCoverage {
  category: AmbulanceCategory;
  availability: AmbulanceAvailability;
  availabilitySource: AvailabilitySource;
  baseFarePaise: number | null;
  perKmPaise: number | null;
  estimatedResponseMinutes: number | null;
  notes: string | null;
  lastConfirmedAt: string | null;
  /** Only true when the claim carries the moment it was given. */
  confirmed: boolean;
}

export interface AmbulanceProvider {
  id: string;
  reference: string;
  name: string;
  providerType: string;
  contactPhone: string | null;
  alternatePhone: string | null;
  emergencyHotline: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinatesVerified: boolean;
  serviceArea: string | null;
  operatingHours: string | null;
  trackingMode: TrackingMode;
  liveTrackingAvailable: boolean;
  dataSourceId: string | null;
  sourceNote: string | null;
  lastVerifiedAt: string | null;
  categories: ProviderCategoryCoverage[];
}

export interface AmbulanceDataSource {
  id: string;
  name: string;
  source_type: string;
  provider: string;
  url: string | null;
  verification_status: string;
  requires_registration: boolean;
  notes: string;
  is_active: boolean;
}

export interface AmbulanceEmergencyContact {
  id: string;
  label: string;
  number: string;
  dial: string;
  scope: string;
  region: string;
  url: string | null;
  notes: string;
}

export interface CoverageSummaryRow {
  category: AmbulanceCategory;
  providersAvailable: number;
  providersLimited: number;
  providersTotal: number;
  lastConfirmedAt: string | null;
}

export interface CoverageDetailRow {
  category: AmbulanceCategory;
  state: string | null;
  district: string | null;
  providersAvailable: number;
  providersLimited: number;
  providersTotal: number;
  lastConfirmedAt: string | null;
}

export interface AmbulanceInfo {
  categories: AmbulanceCategory[];
  urgencies: AmbulanceUrgency[];
  needs: AmbulanceNeed[];
  availabilityStates: AmbulanceAvailability[];
  bookingStatuses: AmbulanceBookingStatus[];
  coverage: CoverageSummaryRow[];
  sources: AmbulanceDataSource[];
  approvedProviders: number;
  providersWithLiveTracking: number;
  disclaimer: string;
  emergencyContacts: AmbulanceEmergencyContact[];
}

export interface EmergencyInfo {
  contacts: AmbulanceEmergencyContact[];
  disclaimer: string;
}

export interface ProvidersResponse {
  providers: AmbulanceProvider[];
  total: number;
  filters: {
    category: AmbulanceCategory | null;
    state: string | null;
    district: string | null;
    q: string | null;
    limit: number;
  };
  availabilityNote: string;
}

export interface AmbulanceBooking {
  reference: string;
  category: AmbulanceCategory;
  urgency: AmbulanceUrgency;
  status: AmbulanceBookingStatus;
  statusUpdatedAt: string;
  patientName: string;
  contactPhone: string;
  patientAge: number | null;
  patientSex: string | null;
  needs: AmbulanceNeed[];
  pickup: {
    address: string;
    landmark: string | null;
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    source: PickupSource;
  };
  destination: {
    name: string | null;
    address: string | null;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  notes: string | null;
  consentToShare: boolean;
  sharedWithProviderAt: string | null;
  providerId: string | null;
  providerReference: string | null;
  providerName: string | null;
  providerPhone: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingEvent {
  status: AmbulanceBookingStatus;
  actor: string;
  source: BookingEventSource;
  note: string | null;
  createdAt: string;
}

export interface TrackedBooking {
  booking: AmbulanceBooking;
  events: BookingEvent[];
  liveTrackingAvailable: boolean;
  acceptanceNote: string;
}

export interface BookingInput {
  category: AmbulanceCategory;
  urgency: AmbulanceUrgency;
  providerId?: string | null;
  patientName: string;
  contactPhone: string;
  patientAge?: number | null;
  patientSex?: "female" | "male" | "other" | "undisclosed" | null;
  needs?: AmbulanceNeed[];
  pickupAddress: string;
  pickupSource: PickupSource;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  pickupAccuracyMeters?: number | null;
  pickupLandmark?: string | null;
  destinationName?: string | null;
  destinationAddress?: string | null;
  destinationPhone?: string | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
  notes?: string | null;
  consentToShare: true;
  idempotencyKey?: string | null;
}

export interface BookingResult {
  booking: AmbulanceBooking;
  duplicate: boolean;
  acceptanceNote: string;
}

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

export interface AmbulanceAdminSession {
  configured: boolean;
  message: string;
}

export interface AdminAmbulanceProvider extends AmbulanceProvider {
  status: AmbulanceProviderStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  email: string | null;
  notes: string | null;
  dispatchIntegration: string | null;
  createdAt: string;
}

export interface AmbulanceAdminStats {
  providers_total: number;
  providers_approved: number;
  providers_pending: number;
  coverage_available: number;
  bookings_total: number;
  bookings_awaiting: number;
  bookings_live: number;
  bookings_completed: number;
  bookings_cancelled: number;
  providers_with_live_tracking: number;
}

export interface AmbulanceAuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}
