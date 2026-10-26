/**
 * Shared types for the MEDIPAL Blood Bank module.
 *
 * These mirror the JSON the server actually returns from `server/blood.mjs` —
 * nothing here is invented. Every value that reaches the UI therefore carries
 * its own provenance (`dataSourceId`, `sourceNote`, `lastUpdatedAt`) so the
 * interface can always say where a number came from and when it was observed.
 */

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const BLOOD_COMPONENTS = [
  "Packed Red Blood Cells",
  "Whole Blood",
  "Platelets",
  "Fresh Frozen Plasma",
  "Cryoprecipitate",
] as const;
export type BloodComponent = (typeof BLOOD_COMPONENTS)[number];

export const BLOOD_PRIORITIES = ["Routine", "Urgent", "Stat Emergency"] as const;
export type BloodPriority = (typeof BLOOD_PRIORITIES)[number];

/** Must stay identical to `FACILITY_CATEGORIES` in `server/blood.mjs`. */
export const FACILITY_CATEGORIES = [
  "Regional Blood Center",
  "Hospital Blood Bank",
  "Trauma Center Depot",
  "Mobile Collection Hub",
] as const;
export type FacilityCategory = (typeof FACILITY_CATEGORIES)[number];

/** Must stay identical to `FOR_WHOM_OPTIONS` in `server/blood.mjs`. */
export const FOR_WHOM_OPTIONS = ["Self", "Family member", "Patient under my care", "Other"] as const;
export type ForWhom = (typeof FOR_WHOM_OPTIONS)[number];

/**
 * Freshness is computed on the real clock from the last time anybody actually
 * observed the facility's stock. `unconfirmed_directory` and `not_reporting`
 * exist precisely so the UI never has to imply knowledge it does not have.
 */
export type FreshnessStatus =
  | "recently_verified"
  | "update_due"
  | "no_stock"
  | "stale_unconfirmed"
  | "unconfirmed_directory"
  | "not_reporting";

export type FreshnessBasis =
  | "facility_inventory_report"
  | "facility_other_stock_report"
  | "no_stock_report";

export type RequestStatus =
  | "created"
  | "sent_to_eligible"
  | "under_review"
  | "proposal_accepted"
  | "proposal_rejected"
  | "dispatched"
  | "received"
  | "closed"
  | "cancelled";

export type FacilityStatus = "pending" | "under_review" | "approved" | "rejected" | "suspended";

export type InventoryStatus = "available" | "reserved" | "quarantine" | "expired" | "approaching_expiry";

export type DataVerificationStatus =
  | "live"
  | "verified"
  | "unverified"
  | "periodic_import"
  | "unavailable";

export interface BloodDataSource {
  id: string;
  name: string;
  sourceType: string;
  provider: string | null;
  url: string | null;
  verificationStatus: DataVerificationStatus | string;
  requiresRegistration: boolean;
  notes: string | null;
  lastSyncedAt: string | null;
  isActive: boolean;
}

export interface FacilitySummary {
  id: string;
  reference: string;
  name: string;
  category: FacilityCategory | string;
  address: string | null;
  city: string;
  district: string | null;
  state: string;
  postalCode: string | null;
  coordinates: [number, number] | null;
  phone: string | null;
  emergencyHotline: string | null;
  hasBloodBank: boolean;
  status: FacilityStatus | string;
  operatingHours: string | null;
  lastVerifiedAt: string | null;
  dataSourceId: string;
  sourceNote: string | null;
}

export interface DirectoryFacility extends FacilitySummary {
  freshnessStatus: FreshnessStatus;
}

export interface AvailabilityRow {
  facility: FacilitySummary;
  bloodGroup: BloodGroup | null;
  component: BloodComponent | null;
  availableQuantity: number;
  unit: string;
  batchCount: number;
  hasStock: boolean;
  lastUpdatedAt: string | null;
  nearestExpiryDate: string | null;
  facilityLastVerifiedAt: string | null;
  freshnessStatus: FreshnessStatus;
  freshnessBasis: FreshnessBasis;
  distanceKm: number | null;
  dataSourceId: string;
  sourceNote: string | null;
}

export interface AvailabilityResponse {
  query: {
    bloodGroup: BloodGroup | null;
    component: BloodComponent | null;
    state: string | null;
    district: string | null;
    city: string | null;
    postalCode: string | null;
    radiusKm: number | null;
    origin: [number, number] | null;
    freshness: string;
    sortBy: string;
  };
  thresholds: { RECENT_HOURS: number; UPDATE_DUE_HOURS: number };
  counts: {
    approvedFacilitiesMatchingArea: number;
    resultRows: number;
    rowsWithStock: number;
  };
  results: AvailabilityRow[];
  truncated: boolean;
  generatedAt: string;
}

export interface StatusCopy {
  label: string;
  explanation: string;
}

export interface EmergencyInfo {
  disclaimer: string;
  helplines: { label: string; number: string; scope: string }[];
}

export interface BloodInfo {
  bloodGroups: BloodGroup[];
  components: BloodComponent[];
  facilityCategories: FacilityCategory[];
  priorities: BloodPriority[];
  requestStatuses: RequestStatus[];
  freshnessThresholds: { RECENT_HOURS: number; UPDATE_DUE_HOURS: number };
  emergency: EmergencyInfo;
  sources: BloodDataSource[];
}

export interface DonorRegistrationInput {
  fullName: string;
  bloodGroup: BloodGroup;
  phone: string;
  email?: string;
  state: string;
  district?: string;
  city: string;
  postalCode?: string;
  lastDonationDate?: string;
  notes?: string;
  ageConfirmed: boolean;
  weightConfirmed: boolean;
  consentToContact: boolean;
}

export interface DonorRegistrationResult {
  reference: string;
  bloodGroup: BloodGroup;
  availability: string;
  location: { city: string; state: string };
  registeredAt: string;
  contactOnFile: string;
  notices: string[];
}

export interface DonorSummary {
  scope: { bloodGroup: BloodGroup | null; state: string | null; city: string | null };
  totalRegisteredDonors: number;
  byGroupAndAvailability: { bloodGroup: BloodGroup; availability: string; donors: number }[];
  dataSource: { id: string; label: string; verificationStatus: string };
  notice: string;
}

export interface BloodRequestInput {
  requesterName: string;
  contactPhone: string;
  contactEmail?: string;
  forWhom: ForWhom;
  patientReference?: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  priority: BloodPriority;
  requiredBy?: string;
  clinicalIndication?: string;
  state: string;
  district?: string;
  city: string;
  postalCode?: string;
  hospitalName?: string;
  consentRecorded: boolean;
}

export interface BloodRequestResult {
  reference: string;
  status: RequestStatus;
  priority: BloodPriority;
  createdAt: string;
  tracking: { howTo: string; reference: string };
  truthfulness: string[];
  nextSteps: string[];
}

export interface RequestTimelineEvent {
  from: RequestStatus | null;
  to: RequestStatus;
  note: string | null;
  actor: string;
  at: string;
}

export interface TrackedRequest {
  reference: string;
  status: RequestStatus;
  priority: BloodPriority;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  requiredBy: string | null;
  location: { city: string; district: string | null; state: string };
  hospitalName: string | null;
  hospitalVerified: boolean;
  contactOnFile: string;
  supplyingFacility: { name: string; phone: string | null } | null;
  createdAt: string;
  updatedAt: string;
  timeline: RequestTimelineEvent[];
  note: string;
}

export interface FacilityApplicationInput {
  name: string;
  category: FacilityCategory;
  address: string;
  state: string;
  district?: string;
  city: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  licenseNumber: string;
  authorizedRep: string;
  phone: string;
  emergencyHotline?: string;
  email?: string;
  operatingHours?: string;
  hasBloodBank?: boolean;
  contactConsent: boolean;
}

export interface FacilityApplicationResult {
  reference: string;
  status: FacilityStatus;
  submittedAt: string;
  notices: string[];
}

export interface FacilityConsoleIdentity {
  facility: FacilitySummary;
  dataSource: { id: string; name: string; verificationStatus: string };
  inventory: { batch_rows: number; total_units: number };
  provenance: string;
}

export interface InventoryItem {
  id: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  quantity: number;
  unit: string;
  batchNumber: string | null;
  collectionDate: string | null;
  expiryDate: string | null;
  storageLocation: string | null;
  status: InventoryStatus;
  effectiveStatus: InventoryStatus;
  notes: string | null;
  reportedBy: string | null;
  lastUpdatedAt: string | null;
  daysToExpiry?: number;
}

export interface InventoryMovement {
  id: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  movementType: string;
  quantity: number;
  unit: string;
  balanceAfter: number | null;
  batchNumber: string | null;
  reason: string;
  performedBy: string | null;
  occurredAt: string;
}

export interface FacilityOpenRequest {
  reference: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  unitsRequired: number;
  priority: BloodPriority;
  city: string;
  district: string | null;
  state: string;
  hospitalName: string | null;
  status: RequestStatus;
  createdAt: string;
  requiredBy: string | null;
  myProposals: number;
}

export interface FacilityTransfer {
  id: string;
  direction: "incoming" | "outgoing";
  fromFacility: string;
  toFacility: string;
  bloodGroup: BloodGroup;
  component: BloodComponent;
  quantity: number;
  unit: string;
  status: string;
  coldChainCode: string | null;
  coldChainStatus: string | null;
  notes: string | null;
  requestedAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
}

export interface ColdChainObservation {
  tempCelsius: number;
  isExcursion: boolean;
  note: string | null;
  recordedBy: string | null;
  recordedAt: string;
}

export interface ColdChainPassport {
  id: string;
  code: string;
  targetMinCelsius: number;
  targetMaxCelsius: number;
  currentTempCelsius: number | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  observationCount: number;
  excursionCount: number;
  observations: ColdChainObservation[];
}

export interface FacilityNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface AdminFacility {
  id: string;
  reference: string;
  name: string;
  category: FacilityCategory | string;
  address: string | null;
  city: string;
  district: string | null;
  state: string;
  postalCode: string | null;
  licenseNumber: string | null;
  status: FacilityStatus;
  hasBloodBank: boolean;
  phone: string | null;
  email: string | null;
  authorizedRep: string | null;
  operatingHours: string | null;
  dataSource: { id: string; name: string; verificationStatus: string };
  sourceNote: string | null;
  submittedAt: string;
  lastVerifiedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  activeCredentials: number;
  inventoryRows: number;
}

export interface AdminStats {
  facilities_total: number;
  facilities_approved: number;
  facilities_pending: number;
  donors: number;
  inventory_rows: number;
  units_tracked: number;
  requests_total: number;
  requests_open: number;
  coldchain_excursions: number;
  expired_batches: number;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface SelfTestCheck {
  id: string;
  label: string;
  status: "pass" | "fail";
  evidence: string;
}

export interface SelfTestResult {
  ranAt: string;
  summary: { total: number; passed: number; failed: number };
  checks: SelfTestCheck[];
  note: string;
}

export interface AdminSession {
  configured: boolean;
  message: string;
}
