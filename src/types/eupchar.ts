/**
 * E-UPCHAR domain model.
 *
 * Mirrors the relational entities listed in spec §22 so the frontend and the
 * server share one vocabulary. Nothing here may be populated with invented
 * data: every "verified" field is only ever written from the owner-supplied
 * dataset, an authorised administrator, or a connected integration.
 */

/* ------------------------------------------------------------------ */
/* Enumerations                                                        */
/* ------------------------------------------------------------------ */

export type UserRole = "patient" | "hospital_staff" | "admin";

export type OwnershipType = "Public" | "Private" | "Trust";

export type ServiceGroup = "imaging" | "laboratory" | "other";

/** Discriminates what a catalogue entry actually is. */
export type ServiceKind = "scan" | "test" | "package" | "appointment" | "other";

/**
 * `verified` — confirmed against a permitted source (safe to charge).
 * `practice` — an amount entered in Practice mode. Never a real hospital price.
 * `unverified` — no reliable price available; payment must stay disabled.
 */
export type PriceVerificationStatus = "verified" | "practice" | "unverified";

export type ScheduleSource =
  | "hospital_api"
  | "authorised_partner"
  | "admin_configured"
  | "practice"
  | "not_connected";

export type BookingStatus =
  | "requested"
  | "pending_hospital_confirmation"
  | "confirmed"
  | "completed"
  | "cancelled";

export type PaymentStatus =
  | "not_collected"
  | "created"
  | "paid"
  | "failed"
  | "cancelled"
  | "pending";

export type ReportStatus = "not_available" | "pending" | "ready";

export type PatientDocumentKind = "prescription" | "patient_photo" | "identity_reference";

/* ------------------------------------------------------------------ */
/* Integration readiness                                               */
/* ------------------------------------------------------------------ */

export type IntegrationMode = "not_configured" | "sandbox" | "live";

export type IntegrationReadiness = {
  /** Base URL for the E-UPCHAR API. Empty means "no backend connected". */
  readonly apiBase: string;
  readonly scheduling: IntegrationMode;
  readonly payments: IntegrationMode;
  readonly maps: IntegrationMode;
  readonly reports: IntegrationMode;
  /** Practice mode in the UI is enabled by the visitor, not by env. */
  readonly practiceModeAvailable: boolean;
};

/* ------------------------------------------------------------------ */
/* Directory entities                                                  */
/* ------------------------------------------------------------------ */

export type Hospital = {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly district: string;
  /** `null` when the dataset does not publish a city — never guessed. */
  readonly city: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly ownership: OwnershipType | null;
  readonly schemes: readonly string[];
  readonly empanelmentStatus: string | null;
  readonly departments: readonly string[];
  readonly openingHours: string | null;
  /** Admin toggle. A disabled listing is hidden from patients. */
  readonly enabled: boolean;
  readonly datasetId: string;
};

export type HospitalLocation = {
  readonly id: string;
  readonly hospitalId: string;
  readonly label: string;
  readonly address: string | null;
  readonly city: string | null;
  readonly district: string;
  readonly state: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** A map marker is only ever rendered when this is true. */
  readonly coordinatesVerified: boolean;
};

export type HospitalDepartment = {
  readonly id: string;
  readonly hospitalId: string;
  readonly name: string;
};

export type ServiceCategory = {
  readonly id: string;
  readonly label: string;
  readonly group: ServiceGroup;
  readonly searchTerms: readonly string[];
};

export type ServiceComponent = {
  readonly id: string;
  readonly serviceId: string;
  readonly name: string;
  readonly note: string | null;
};

export type Service = {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly group: ServiceGroup;
  readonly kind: ServiceKind;
  readonly summary: string;
  readonly description: string;
};

/**
 * The hospital ↔ service relationship. Availability is per hospital: a service
 * configured at Hospital A never appears at Hospital B.
 */
export type HospitalService = {
  readonly id: string;
  readonly hospitalId: string;
  readonly serviceId: string;
  readonly available: boolean;
  /** MEDIPAL booking policy for this hospital+service. */
  readonly requiresPrescription: boolean;
  /** `null` when the hospital has not published turnaround information. */
  readonly reportTurnaround: string | null;
  /** `null` means "not published" — the UI shows the required honest fallback. */
  readonly preparationInstructions: string | null;
  readonly prerequisiteServiceIds: readonly string[];
};

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

export type PriceSource = {
  readonly id: string;
  readonly name: string;
  readonly url: string | null;
  readonly type: "hospital" | "official_online" | "verified_third_party";
  /** Whether the business is legally permitted to publish this source. */
  readonly permitted: boolean;
};

/**
 * All amounts are integer paise to avoid floating point drift. `null` means the
 * amount is genuinely unknown, which is different from `0`.
 */
export type ServicePrice = {
  readonly id: string;
  readonly hospitalId: string;
  readonly serviceId: string;
  readonly hospitalPricePaise: number | null;
  readonly officialOnlinePricePaise: number | null;
  readonly thirdPartyOnlinePricePaise: number | null;
  readonly sourceId: string | null;
  readonly lastVerifiedOn: string | null;
  readonly conditions: string | null;
  /** Taxes and additional charges, in paise, added on top of the base price. */
  readonly taxesAndFeesPaise: number | null;
  /**
   * The amount actually payable. For `verified` records this is recalculated
   * server-side before payment — never trusted from the client.
   */
  readonly finalPayablePaise: number | null;
  readonly verificationStatus: PriceVerificationStatus;
};

/* ------------------------------------------------------------------ */
/* Patients and documents                                              */
/* ------------------------------------------------------------------ */

export type PatientGender = "female" | "male" | "other" | "undisclosed";

export type PatientRelation =
  | "self"
  | "spouse"
  | "child"
  | "parent"
  | "sibling"
  | "other";

/**
 * Identity is stored masked. Only the last 4 characters are ever retained and
 * the full value never reaches storage, URLs, logs or analytics (spec §11).
 */
export type MaskedIdentity = {
  readonly kind: "aadhaar_last4" | "pmjay_card_last4" | "other_id_last4";
  /** e.g. `•••• •••• 1234`. */
  readonly masked: string;
  readonly consentedAt: string;
};

export type Patient = {
  readonly id: string;
  /** Owner. Every read is filtered by this on the server. */
  readonly ownerUserId: string;
  readonly fullName: string;
  /** ISO date (`YYYY-MM-DD`). */
  readonly dateOfBirth: string;
  readonly gender: PatientGender;
  readonly phone: string;
  readonly email: string | null;
  readonly relationship: PatientRelation;
  readonly address: string | null;
  readonly emergencyContact: string | null;
  readonly identity: MaskedIdentity | null;
  readonly createdAt: string;
};

/** Only metadata is persisted client-side; the binary lives in private storage. */
export type PatientDocument = {
  readonly id: string;
  readonly patientId: string | null;
  readonly ownerUserId: string;
  readonly bookingId: string | null;
  readonly kind: PatientDocumentKind;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Storage reference path — never a public URL. */
  readonly storagePath: string | null;
  readonly uploadedAt: string;
};

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

export type AppointmentSlot = {
  readonly id: string;
  readonly hospitalId: string;
  readonly serviceId: string;
  /** ISO timestamp. */
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly booked: number;
  /** Set while a patient holds the slot during checkout. */
  readonly heldUntil: string | null;
  readonly source: ScheduleSource;
};

/* ------------------------------------------------------------------ */
/* Bookings, payments, invoices                                        */
/* ------------------------------------------------------------------ */

/** A frozen copy of what was priced at the moment of booking. */
export type BookingItem = {
  readonly id: string;
  readonly label: string;
  readonly quantity: number;
  /** `null` when the price was not verified at booking time. */
  readonly unitPricePaise: number | null;
  readonly taxesPaise: number | null;
  readonly feesPaise: number | null;
  readonly verificationStatus: PriceVerificationStatus;
};

export type Payment = {
  readonly id: string;
  readonly bookingId: string;
  readonly provider: "razorpay" | "none";
  readonly providerOrderId: string | null;
  readonly providerPaymentId: string | null;
  readonly amountPaise: number | null;
  readonly currency: "INR";
  readonly status: PaymentStatus;
  /** True when this payment ran against a sandbox — never real money. */
  readonly sandbox: boolean;
  readonly createdAt: string;
};

/**
 * Always a MEDIPAL-issued document. `documentType` exists so the UI can never
 * present it as an official hospital tax invoice (spec §15).
 */
export type Invoice = {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly bookingId: string;
  readonly issuedAt: string;
  readonly documentType: "medipal_booking_acknowledgement" | "medipal_payment_receipt";
  readonly amountPaise: number | null;
  readonly paymentStatus: PaymentStatus;
  readonly paymentReference: string | null;
  readonly sandbox: boolean;
  readonly lines: readonly BookingItem[];
};

export type Booking = {
  readonly id: string;
  /** Human-readable reference shown to the patient. */
  readonly reference: string;
  readonly userId: string;
  readonly patientId: string;
  readonly hospitalId: string;
  readonly serviceId: string;
  readonly hospitalServiceId: string;
  readonly status: BookingStatus;
  readonly appointmentStartsAt: string | null;
  readonly appointmentEndsAt: string | null;
  readonly scheduleSource: ScheduleSource;
  readonly paymentId: string | null;
  readonly invoiceId: string | null;
  readonly prescriptionDocumentId: string | null;
  readonly items: readonly BookingItem[];
  /** Sum of the booking items in paise, or `null` when no price was verified. */
  readonly totalPayablePaise: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type Report = {
  readonly id: string;
  readonly bookingId: string;
  readonly userId: string;
  readonly serviceName: string;
  readonly hospitalName: string;
  readonly status: ReportStatus;
  readonly reportDate: string | null;
  /** Only set when an authorised diagnostic source actually supplied a file. */
  readonly downloadUrl: string | null;
};

export type Review = {
  readonly id: string;
  readonly hospitalId: string;
  readonly authorLabel: string;
  readonly rating: number;
  readonly body: string;
  readonly createdAt: string;
  /** Only true when the review is tied to a completed booking. */
  readonly verifiedBooking: boolean;
};

export type AuditLog = {
  readonly id: string;
  readonly actorId: string;
  readonly actorRole: UserRole;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly at: string;
  readonly meta: Readonly<Record<string, string | number | boolean | null>>;
};

/**
 * Transient client read-model used by the current E-UPCHAR screens. It is never
 * persisted in browser storage. Production reads/writes must be backed by the
 * server API and an authenticated session; this shape also makes the offline
 * and explicitly-labelled practice state easy to keep honest.
 */
export type EUpcharState = {
  readonly practiceMode: boolean;
  readonly locationSelection: LocationSelection | null;
  readonly hospitalEnabled: Readonly<Record<string, boolean>>;
  readonly hospitalDepartments: Readonly<Record<string, readonly string[]>>;
  readonly hospitalServices: readonly HospitalService[];
  readonly servicePrices: readonly ServicePrice[];
  readonly priceSources: readonly PriceSource[];
  readonly patients: readonly Patient[];
  readonly documents: readonly PatientDocument[];
  readonly bookings: readonly Booking[];
  readonly payments: readonly Payment[];
  readonly invoices: readonly Invoice[];
  readonly reports: readonly Report[];
  readonly auditLogs: readonly AuditLog[];
};

/* ------------------------------------------------------------------ */
/* View-model helpers                                                  */
/* ------------------------------------------------------------------ */

/** What the visitor picked in `Select Location`. Persisted between screens. */
export type LocationSelection = {
  readonly state: string;
  readonly district: string | null;
  readonly hospitalId: string | null;
  readonly savedAt: string;
};

/** A catalogue row joined with its hospital-specific availability and price. */
export type HospitalServiceView = {
  readonly service: Service;
  readonly category: ServiceCategory;
  readonly hospitalService: HospitalService;
  readonly price: ServicePrice | null;
  readonly components: readonly ServiceComponent[];
  /** The amount to display, honouring verification rules. */
  readonly displayPricePaise: number | null;
  readonly priceStatus: PriceVerificationStatus;
};

/** Itemised, server-recalculated checkout summary. */
export type PriceBreakdown = {
  readonly lines: readonly BookingItem[];
  readonly subtotalPaise: number | null;
  readonly taxesAndFeesPaise: number | null;
  readonly discountPaise: number | null;
  readonly totalPayablePaise: number | null;
  readonly status: PriceVerificationStatus;
  /** Reasons the total cannot be shown as a chargeable amount. */
  readonly blockers: readonly string[];
};

/** Every exact string the spec fixes, in one place so copy can't drift. */
export const E_UPCHAR_COPY = {
  subtitle: "Healthcare services, appointments and diagnostics in one place.",
  searchPlaceholder: "Search hospitals, doctors, scans or tests",
  selectLocationTitle: "Select Location",
  selectLocationSearch: "Search State, District or Hospital",
  serviceSearchPlaceholder: "Search X-Ray, MRI, CT, blood tests and more",
  emptyCategory:
    "No services are currently listed in this category for the selected hospital.",
  priceUnavailable: "Price unavailable — contact the hospital.",
  preparationFallback:
    "Please confirm preparation requirements with the selected hospital.",
  schedulingNotConnected:
    "Appointment scheduling is not connected for this hospital yet.",
  prescriptionHeading: "Book With Prescription",
  prescriptionBody: "Upload your prescription to continue with the selected service.",
  confirmationHeading: "Your Booking Is Confirmed",
} as const;
