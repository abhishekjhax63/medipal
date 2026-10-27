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

// ---------------------------------------------------------------------------
// Bihar live availability (§5, §11-§17, §25)
// ---------------------------------------------------------------------------
// These mirror the shapes `server/blood/live-routes.mjs` returns. Freshness is
// always computed on the server from the source's own observation time and
// sent as a verdict; the browser never re-derives it, so a client clock that is
// wrong cannot make stale stock look fresh.

/** The freshness ladder from §5. Only `LIVE` may be presented as current. */
export type LiveFreshnessLevel = "LIVE" | "RECENT" | "STALE" | "OUTDATED" | "UNKNOWN";

/** The status the source itself reported (§4). Never guessed by the browser. */
export type AvailabilityStatus = "AVAILABLE" | "LOW" | "UNAVAILABLE" | "UNKNOWN";

/** Minutes; the boundaries between LIVE / RECENT / STALE / OUTDATED. */
export interface FreshnessThresholds {
  live: number;
  recent: number;
  stale: number;
}

/** The provenance block every result row carries (§16, §28). */
export interface LiveDataSourceRef {
  id: string;
  label: string;
  priority: number;
  verificationStatus: string;
  url: string | null;
  note: string | null;
}

/** One centre × blood group × component figure, with provenance and freshness. */
export interface LiveCentreRow {
  centreId: string;
  reference: string;
  externalId: string | null;
  name: string;
  category: string;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string;
  postalCode: string | null;
  coordinates: [number, number] | null;
  phone: string | null;
  emergencyHotline: string | null;
  verification: string;
  bloodGroup: string;
  component: string;
  units: number;
  unit: string;
  availabilityStatus: AvailabilityStatus;
  freshness: LiveFreshnessLevel;
  /** The source's own observation time — the basis of the freshness verdict. */
  lastUpdatedAt: string | null;
  /** When MEDIPAL wrote the row. Never used to claim LIVE. */
  syncedAt: string | null;
  isProviderSynced: boolean;
  batchCount: number;
  nearestExpiryDate: string | null;
  distanceKm: number | null;
  source: LiveDataSourceRef;
  disclaimer: string;
}

export interface BiharDistrict {
  id: string;
  name: string;
  state: string;
  /** Administrative headquarters, for map centring only — not a centre. */
  centre: [number, number] | null;
  approvedCentres: number;
}

export interface DistrictsResponse {
  state: string;
  count: number;
  districts: BiharDistrict[];
  note: string;
}

export type CentreSort = "priority" | "emergency" | "distance" | "freshness";

export interface CentresResponse {
  query: {
    state: string;
    district: string | null;
    bloodGroup: string | null;
    component: string | null;
    latitude: number | null;
    longitude: number | null;
    radiusKm: number | null;
    sortBy: CentreSort;
    limit: number;
  };
  thresholdsMinutes: FreshnessThresholds;
  counts: { rows: number; shown: number; centres: number };
  results: LiveCentreRow[];
  truncated: boolean;
  generatedAt: string;
  disclaimer: string;
  notice: string;
}

export interface NearbyCentresResponse {
  origin: { latitude: number; longitude: number };
  radiusKm: number;
  query: { bloodGroup: string | null; component: string | null };
  counts: { centres: number; rows: number };
  results: LiveCentreRow[];
  truncated: boolean;
  generatedAt: string;
  disclaimer: string;
  notice: string;
}

export type ProviderHealthState =
  | "healthy"
  | "degraded"
  | "offline"
  | "not_configured"
  | "unknown"
  | string;

export interface ProviderHealthSource {
  id: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  priority: number;
  mode: "pull" | "push" | string;
  health: ProviderHealthState;
  healthMessage: string | null;
  lastSuccessfulSync: string | null;
  lastFailedSync: string | null;
  lastHealthCheckAt: string | null;
  baseUrlConfigured: boolean;
  verificationStatus: string;
}

export interface BloodHealthResponse {
  status: ProviderHealthState;
  generatedAt: string;
  syncIntervalMinutes: number;
  thresholdsMinutes: FreshnessThresholds;
  lastSuccessfulSync: string | null;
  nextSyncInMinutes: number | null;
  sources: ProviderHealthSource[];
  records: { total: number; providerRows: number; live: number };
  /** The most recent run of any provider, or `null` if none has ever run. */
  lastRun: SyncRunSummary | null;
  notice: string;
}

export interface SchedulerStatus {
  running: boolean;
  busy: boolean;
  intervalMinutes: number;
  lastTickAt: string | null;
  lastResults: { provider: string | null; status: string; message: string | null }[] | null;
  thresholdsMinutes: FreshnessThresholds;
}

export interface BloodDataOverview {
  centres: {
    total: number;
    approved: number;
    fromProviders: number;
    fromVerifiedCentres: number;
  };
  inventory: {
    rows: number;
    centresWithStock: number;
    providerRows: number;
    liveRows: number;
    staleRows: number;
    unavailableRows: number;
    unknownRows: number;
  };
  sync: {
    runsLastSevenDays: number;
    succeeded: number;
    failed: number;
    /** `null` when nothing has been attempted — never a fabricated 100%. */
    successRate: number | null;
    lastSuccessfulSync: string | null;
    lastAttemptAt: string | null;
  };
  thresholdsMinutes: FreshnessThresholds;
  intervalMinutes: number;
  generatedAt: string;
}

export interface SyncRunError {
  externalId: string | null;
  type: string;
  message: string;
  excerpt: unknown;
  at: string;
}

export interface SyncRunRecord {
  runId: string;
  provider: string;
  status: "running" | "success" | "partial" | "failed" | "skipped" | string;
  startedAt: string | null;
  completedAt: string | null;
  recordsReceived: number | null;
  recordsInserted: number | null;
  recordsUpdated: number | null;
  recordsUnchanged: number | null;
  recordsFailed: number | null;
  centresUpserted: number | null;
  requestAttempts: number | null;
  durationMs: number | null;
  message: string | null;
  errors: SyncRunError[];
}

export interface SyncRunsResponse {
  runs: SyncRunRecord[];
  providerFilter: string | null;
  generatedAt: string;
}

/** A run as stored, without the per-record error list the admin view adds. */
export type SyncRunSummary = Omit<SyncRunRecord, "runId" | "errors">;

export interface BloodDataAdminResponse {
  overview: BloodDataOverview;
  health: BloodHealthResponse;
  scheduler: SchedulerStatus;
}

/** The outcome the admin "Run sync now" button reports back. */
export interface SyncRunResult {
  provider: string;
  runId: string | null;
  status: string;
  message: string | null;
  records: {
    received: number;
    inserted: number;
    updated: number;
    unchanged: number;
    failed: number;
    notRestated: number;
  };
  centresUpserted: number;
  durationMs: number;
  subscribers: number;
  note: string;
}

/** A single event pushed over `GET /api/blood/stream` (§11-§13). */
export interface LiveStreamEvent {
  type: "hello" | "inventory.change" | "sync.completed" | "sync.failed" | string;
  at: string;
  /** Present on `hello`. */
  subscribers?: number;
  note?: string;
  /** Present on `inventory.change`. */
  change?: "inserted" | "updated";
  facilityId?: string;
  bloodGroup?: string;
  component?: string;
  previousUnits?: number;
  units?: number;
  availabilityStatus?: AvailabilityStatus;
  sourceUpdatedAt?: string | null;
  source?: string;
  /** Present on `sync.*`. */
  provider?: string;
  runId?: string;
  status?: string;
  message?: string;
  replayed?: boolean;
}
