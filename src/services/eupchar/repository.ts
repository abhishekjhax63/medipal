/**
 * E-UPCHAR screen repository.
 *
 * The supplied Bihar directory is read-only verified source data. Hospital
 * service catalogues, slots and prices begin empty. Practice mode is a clearly
 * labelled, session-only walkthrough; it is never presented as a provider
 * integration, confirmation, price, or payment.
 */

import { buildHospitalServiceView, matchesHospitalQuery, matchesServiceQuery, verifiedHospitalEntities } from "@/data/eupchar/directory";
import { buildPracticeHospitalServices, buildPracticeServicePrices, buildPracticeSlots, practicePriceSource } from "@/data/eupchar/practiceData";
import { serviceCategories, serviceCategoriesById, services } from "@/data/eupchar/serviceCatalog";
import type { AuditLog, Booking, BookingItem, BookingStatus, EUpcharState, Hospital, HospitalService, HospitalServiceView, Invoice, LocationSelection, Patient, PatientDocument, Payment, PaymentStatus, PriceSource, ServicePrice } from "@/types/eupchar";

const LOCAL_OWNER = "unverified-local-session";
const listeners = new Set<() => void>();
let serial = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++serial).toString(36)}`;

let state: EUpcharState = {
  practiceMode: false,
  locationSelection: null,
  hospitalEnabled: {},
  hospitalDepartments: {},
  hospitalServices: [],
  servicePrices: [],
  priceSources: [],
  patients: [],
  documents: [],
  bookings: [],
  payments: [],
  invoices: [],
  reports: [],
  auditLogs: [],
};

function commit(patch: Partial<EUpcharState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function audit(action: string, entity: string, entityId: string, meta: AuditLog["meta"] = {}) {
  const entry: AuditLog = { id: uid("audit"), actorId: LOCAL_OWNER, actorRole: "patient", action, entity, entityId, at: new Date().toISOString(), meta };
  commit({ auditLogs: [entry, ...state.auditLogs] });
}

export function getEupcharSnapshot(): EUpcharState { return state; }
export function subscribeEupchar(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }

export type PatientInput = Pick<Patient, "fullName" | "dateOfBirth" | "gender" | "phone" | "email" | "relationship" | "address" | "emergencyContact" | "identity">;
export type BookingInput = Pick<Booking, "patientId" | "hospitalId" | "serviceId" | "appointmentStartsAt" | "appointmentEndsAt" | "scheduleSource" | "prescriptionDocumentId" | "notes">;

function actualServices(current: EUpcharState) { return current.practiceMode ? buildPracticeHospitalServices(verifiedHospitalEntities.map((hospital) => hospital.id)) : current.hospitalServices; }
function actualPrices(current: EUpcharState) { return current.practiceMode ? buildPracticeServicePrices(verifiedHospitalEntities.map((hospital) => hospital.id)) : current.servicePrices; }
function actualSlots(current: EUpcharState) { return current.practiceMode ? buildPracticeSlots(verifiedHospitalEntities.map((hospital) => hospital.id)) : []; }

export function selectAllHospitals(current = state): Hospital[] {
  return verifiedHospitalEntities
    .map((hospital) => ({ ...hospital, enabled: current.hospitalEnabled[hospital.id] ?? true, departments: current.hospitalDepartments[hospital.id] ?? hospital.departments }))
    .filter((hospital) => hospital.enabled);
}
export function selectHospitals(current = state): Hospital[] { return selectAllHospitals(current); }
export function selectHospital(id: string | null, current = state): Hospital | null { return id ? selectAllHospitals(current).find((hospital) => hospital.id === id) ?? null : null; }
export function selectHospitalServices(hospitalId: string, current = state): readonly HospitalService[] { return actualServices(current).filter((item) => item.hospitalId === hospitalId && item.available); }
export function selectHospitalServiceView(hospitalId: string, serviceId: string, current = state): HospitalServiceView | null {
  const link = selectHospitalServices(hospitalId, current).find((item) => item.serviceId === serviceId);
  const service = services.find((item) => item.id === serviceId);
  if (!link || !service) return null;
  return buildHospitalServiceView(service, link, actualPrices(current).find((item) => item.hospitalId === hospitalId && item.serviceId === serviceId) ?? null);
}
export function selectHospitalCatalogue(hospitalId: string, current = state): HospitalServiceView[] {
  return selectHospitalServices(hospitalId, current).map((item) => selectHospitalServiceView(hospitalId, item.serviceId, current)).filter((item): item is HospitalServiceView => Boolean(item));
}
export function selectCatalogueBuckets(hospitalId: string, current = state) {
  const rows = selectHospitalCatalogue(hospitalId, current);
  return serviceCategories.map((category) => ({ category, group: category.group, views: rows.filter((row) => row.category.id === category.id) })).filter((bucket) => bucket.views.length > 0);
}
export function selectServiceSearchResults(hospitalId: string, query: string, current = state) { return selectHospitalCatalogue(hospitalId, current).filter((row) => matchesServiceQuery(row.service, row.category, query)); }
export function selectGlobalSuggestions(query: string, current = state) {
  const term = query.trim(); if (!term) return [] as Array<{ kind: "hospital"; hospital: Hospital } | { kind: "service"; service: string; category: string }>;
  const hospitals = selectAllHospitals(current).filter((hospital) => matchesHospitalQuery(hospital, term)).slice(0, 4).map((hospital) => ({ kind: "hospital" as const, hospital }));
  const catalogue = services.filter((service) => matchesServiceQuery(service, serviceCategoriesById.get(service.categoryId)!, term)).slice(0, 4).map((service) => ({ kind: "service" as const, service: service.name, category: serviceCategoriesById.get(service.categoryId)?.label ?? "Service" }));
  return [...hospitals, ...catalogue];
}

export function selectLocationSelection(current = state) { return current.locationSelection; }
export function setLocationSelection(value: LocationSelection) { commit({ locationSelection: value }); }
export function setPracticeMode(value: boolean) { commit({ practiceMode: value }); audit("practice_mode_changed", "session", "practice", { enabled: value }); }

export function selectPatients(current = state) { return current.patients; }
export function selectPatient(id: string | null, current = state) { return id ? current.patients.find((patient) => patient.id === id) ?? null : null; }
export function createPatient(input: PatientInput): Patient {
  const patient: Patient = { id: uid("patient"), ownerUserId: LOCAL_OWNER, ...input, createdAt: new Date().toISOString() };
  commit({ patients: [...state.patients, patient] }); audit("patient_added", "patients", patient.id); return patient;
}
export function requestPatientDeletion(id: string) { commit({ patients: state.patients.filter((patient) => patient.id !== id), documents: state.documents.filter((document) => document.patientId !== id) }); audit("patient_removed", "patients", id); }

export function selectDocuments(current = state) { return current.documents; }
export function addDocument(input: Omit<PatientDocument, "id" | "ownerUserId" | "storagePath" | "uploadedAt">): PatientDocument {
  const document: PatientDocument = { ...input, id: uid("document"), ownerUserId: LOCAL_OWNER, storagePath: null, uploadedAt: new Date().toISOString() };
  commit({ documents: [...state.documents, document] }); audit("document_metadata_added", "patient_documents", document.id, { kind: document.kind }); return document;
}
export function removeDocument(id: string) { commit({ documents: state.documents.filter((document) => document.id !== id) }); audit("document_metadata_removed", "patient_documents", id); }

export function selectSlots(hospitalId: string, serviceId: string, current = state) { return actualSlots(current).filter((slot) => slot.hospitalId === hospitalId && slot.serviceId === serviceId); }
export function isSlotTaken(hospitalId: string, serviceId: string, startsAt: string, current = state) {
  const slot = selectSlots(hospitalId, serviceId, current).find((item) => item.startsAt === startsAt);
  if (!slot || slot.booked >= slot.capacity) return true;
  return current.bookings.some((booking) => booking.hospitalId === hospitalId && booking.serviceId === serviceId && booking.appointmentStartsAt === startsAt && booking.status !== "cancelled");
}

export function createBooking(input: BookingInput): { ok: true; booking: Booking } | { ok: false; reason: string } {
  const patient = selectPatient(input.patientId); const view = selectHospitalServiceView(input.hospitalId, input.serviceId);
  if (!patient || !view) return { ok: false, reason: "Choose a valid patient, hospital and currently listed service." };
  if (!state.practiceMode) return { ok: false, reason: "Online booking is unavailable until an authenticated hospital integration is configured. You can call the hospital instead." };
  if (input.appointmentStartsAt && isSlotTaken(input.hospitalId, input.serviceId, input.appointmentStartsAt)) return { ok: false, reason: "That practice slot is no longer available. Choose another one." };
  const price = view.displayPricePaise;
  const item: BookingItem = { id: uid("item"), label: view.service.name, quantity: 1, unitPricePaise: price, taxesPaise: view.price?.taxesAndFeesPaise ?? null, feesPaise: null, verificationStatus: "practice" };
  const booking: Booking = { id: uid("booking"), reference: `PRACTICE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId: LOCAL_OWNER, patientId: patient.id, hospitalId: input.hospitalId, serviceId: input.serviceId, hospitalServiceId: view.hospitalService.id, status: "requested", appointmentStartsAt: input.appointmentStartsAt, appointmentEndsAt: input.appointmentEndsAt, scheduleSource: "practice", paymentId: null, invoiceId: null, prescriptionDocumentId: input.prescriptionDocumentId, totalPayablePaise: price, notes: input.notes, items: [item], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  commit({ bookings: [booking, ...state.bookings] }); audit("practice_booking_created", "bookings", booking.id); return { ok: true, booking };
}
export function selectBookings(current = state) { return current.bookings; }
export function selectBooking(id: string | null, current = state) { return id ? current.bookings.find((booking) => booking.id === id) ?? null : null; }
export function setBookingStatus(id: string, status: BookingStatus) { commit({ bookings: state.bookings.map((booking) => booking.id === id ? { ...booking, status, updatedAt: new Date().toISOString() } : booking) }); audit("booking_status_changed", "bookings", id, { status }); }

export function attachPayment(bookingId: string, input: { providerPaymentId: string | null; orderId: string | null; amountPaise: number; status: PaymentStatus; sandbox: boolean }): Payment {
  const payment: Payment = { id: uid("payment"), bookingId, provider: input.sandbox ? "none" : "razorpay", providerOrderId: input.orderId, providerPaymentId: input.providerPaymentId, amountPaise: input.amountPaise, currency: "INR", status: input.status, sandbox: input.sandbox, createdAt: new Date().toISOString() };
  commit({ payments: [...state.payments, payment], bookings: state.bookings.map((booking) => booking.id === bookingId ? { ...booking, paymentId: payment.id, updatedAt: new Date().toISOString() } : booking) }); audit("payment_recorded", "payments", payment.id, { status: input.status, sandbox: input.sandbox }); return payment;
}
export function selectPayment(id: string | null, current = state) { return id ? current.payments.find((payment) => payment.id === id) ?? null : null; }
export function issueInvoice(bookingId: string, paymentId: string | null): Invoice | null {
  const booking = selectBooking(bookingId); if (!booking) return null;
  const payment = selectPayment(paymentId); const paid = payment?.status === "paid";
  const invoice: Invoice = { id: uid("invoice"), invoiceNumber: `MED-${new Date().getFullYear()}-${String(serial).padStart(6, "0")}`, bookingId, issuedAt: new Date().toISOString(), documentType: paid ? "medipal_payment_receipt" : "medipal_booking_acknowledgement", amountPaise: booking.totalPayablePaise, paymentStatus: payment?.status ?? "not_collected", paymentReference: payment?.providerPaymentId ?? null, sandbox: Boolean(payment?.sandbox), lines: booking.items };
  commit({ invoices: [...state.invoices, invoice], bookings: state.bookings.map((entry) => entry.id === bookingId ? { ...entry, invoiceId: invoice.id, updatedAt: new Date().toISOString() } : entry) }); audit("invoice_issued", "invoices", invoice.id); return invoice;
}
export function selectInvoice(id: string | null, current = state) { return id ? current.invoices.find((invoice) => invoice.id === id) ?? null : null; }
export function selectReports(current = state) { return current.reports; }

export function setHospitalEnabled(id: string, enabled: boolean) { commit({ hospitalEnabled: { ...state.hospitalEnabled, [id]: enabled } }); audit("hospital_visibility_changed", "hospitals", id, { enabled }); }
export function setHospitalDepartments(id: string, departments: string[]) { commit({ hospitalDepartments: { ...state.hospitalDepartments, [id]: departments } }); audit("hospital_departments_changed", "hospitals", id); }
export function upsertHospitalService(input: HospitalService) { const current = state.hospitalServices.filter((item) => item.id !== input.id && !(item.hospitalId === input.hospitalId && item.serviceId === input.serviceId)); commit({ hospitalServices: [...current, input] }); audit("hospital_service_upserted", "hospital_services", input.id); }
export function removeHospitalService(id: string) { commit({ hospitalServices: state.hospitalServices.filter((item) => item.id !== id) }); audit("hospital_service_removed", "hospital_services", id); }
export function upsertPriceSource(input: PriceSource) { commit({ priceSources: [...state.priceSources.filter((item) => item.id !== input.id), input] }); audit("price_source_upserted", "price_sources", input.id); }
export function upsertServicePrice(input: ServicePrice) { commit({ servicePrices: [...state.servicePrices.filter((item) => item.id !== input.id && !(item.hospitalId === input.hospitalId && item.serviceId === input.serviceId)), input] }); audit("service_price_upserted", "service_prices", input.id); }
export function removeServicePrice(id: string) { commit({ servicePrices: state.servicePrices.filter((item) => item.id !== id) }); audit("service_price_removed", "service_prices", id); }
export function selectAuditLogs(current = state) { return current.auditLogs; }
export function resetLocalData() { state = { ...state, practiceMode: false, locationSelection: null, hospitalEnabled: {}, hospitalDepartments: {}, hospitalServices: [], servicePrices: [], priceSources: [], patients: [], documents: [], bookings: [], payments: [], invoices: [], reports: [], auditLogs: [] }; listeners.forEach((listener) => listener()); }

// Expose taxonomy and the explicitly labelled source to existing screens.
export { practicePriceSource, serviceCategories, serviceCategoriesById, services };
