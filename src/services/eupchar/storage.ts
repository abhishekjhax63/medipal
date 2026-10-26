/**
 * Local persistence for E-UPCHAR.
 *
 * This is the *development* adapter. In a connected deployment these records live
 * in Postgres behind the API (see `db/schema.sql`) and the browser holds nothing.
 *
 * Privacy rules enforced here (spec §11):
 *  - Patient identity references are stripped before writing. The masked Aadhaar /
 *    PM-JAY reference the visitor enters is kept in memory for the session only and
 *    is never written to browser storage, never put in a URL and never logged.
 *  - Uploaded documents are stored as metadata only; the binary never touches
 *    `localStorage`.
 */

import type {
  AuditLog,
  Booking,
  HospitalService,
  Invoice,
  LocationSelection,
  Patient,
  PatientDocument,
  Payment,
  PriceSource,
  Report,
  ServicePrice,
} from "@/types/eupchar";

export const EUPCHAR_STORAGE_KEY = "medipal.eupchar.v1";
const STORAGE_VERSION = 1;

export type PersistedState = {
  version: number;
  /** Single local identity until real auth is connected. */
  currentUserId: string;
  locationSelection: LocationSelection | null;
  practiceMode: boolean;
  /** Administrator-configured hospital ↔ service availability. */
  hospitalServices: HospitalService[];
  servicePrices: ServicePrice[];
  priceSources: PriceSource[];
  /** Administrator toggles for listing visibility, keyed by hospital id. */
  hospitalEnabled: Record<string, boolean>;
  /** Emergency contacts and department names added by an administrator. */
  hospitalDepartments: Record<string, string[]>;
  patients: Patient[];
  bookings: Booking[];
  payments: Payment[];
  invoices: Invoice[];
  documents: PatientDocument[];
  reports: Report[];
  auditLogs: AuditLog[];
};

export const LOCAL_USER_ID = "local-user";

export function createInitialState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    currentUserId: LOCAL_USER_ID,
    locationSelection: null,
    practiceMode: false,
    hospitalServices: [],
    servicePrices: [],
    priceSources: [],
    hospitalEnabled: {},
    hospitalDepartments: {},
    patients: [],
    bookings: [],
    payments: [],
    invoices: [],
    documents: [],
    reports: [],
    auditLogs: [],
  };
}

/** Removes anything that must never be persisted client-side. */
function sanitize(state: PersistedState): PersistedState {
  return {
    ...state,
    version: STORAGE_VERSION,
    patients: state.patients.map((patient) => ({ ...patient, identity: null })),
    // Audit metadata can echo user input, so keep it tight.
    auditLogs: state.auditLogs.slice(-200),
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadState(): PersistedState {
  if (!isBrowser()) return createInitialState();
  try {
    const raw = window.localStorage.getItem(EUPCHAR_STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (parsed.version !== STORAGE_VERSION) return createInitialState();
    return sanitize({ ...createInitialState(), ...parsed });
  } catch {
    // Corrupt or unavailable storage must never break the app.
    return createInitialState();
  }
}

export function saveState(state: PersistedState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(EUPCHAR_STORAGE_KEY, JSON.stringify(sanitize(state)));
  } catch {
    // Storage full or blocked (private mode) — the session still works in memory.
  }
}

export function clearState(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(EUPCHAR_STORAGE_KEY);
  } catch {
    /* no-op */
  }
}

function randomSuffix(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  }
  return Math.random().toString(36).slice(2, 12).toUpperCase();
}

/** Booking reference shown to the patient, e.g. `MP-EU-7F3A9C21`. */
export function newBookingReference(): string {
  return `MP-EU-${randomSuffix()}`;
}

/** Invoice number. In production this is generated securely server-side. */
export function newInvoiceNumber(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `MPR/${stamp}/${randomSuffix().slice(0, 6)}`;
}

export function newId(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}
