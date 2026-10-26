/**
 * E-UPCHAR hospital/service API.
 *
 * Public reads only return administrator-configured hospital facts and hospital
 * service links. Every patient, booking, payment and admin operation requires
 * a gateway-verified identity and applies server-side ownership/role checks.
 * No route falls back to a placeholder user or creates a fake slot/payment.
 */

import { randomUUID } from "node:crypto";
import { query, withTransaction, dbConfigured } from "./db.mjs";
import { requireAuthenticatedUser } from "./auth.mjs";
import { createOrder, verifyPayment } from "./payments.mjs";
import { readJsonBody, sendJson, HttpError } from "./http.mjs";
import { optionalEmail, phone, text, oneOf, limitFrom } from "./validate.mjs";
import { enforceRateLimit } from "./rate-limit.mjs";

const GENDERS = ["female", "male", "other", "undisclosed"];
const RELATIONSHIPS = ["self", "spouse", "child", "parent", "sibling", "other"];
const ROLES = ["patient", "hospital_staff", "admin"];

function requireDatabase() {
  if (!dbConfigured) throw new HttpError(503, "The E-UPCHAR database is not configured. Set DATABASE_URL and run npm run db:setup.", "DB_NOT_CONFIGURED");
}

function hospital(row) {
  return {
    id: row.id, name: row.name, state: row.state, district: row.district,
    city: row.city, address: row.address, phone: row.phone, ownership: row.ownership,
    schemes: row.schemes || [], empanelmentStatus: row.empanelment_status,
    openingHours: row.opening_hours, enabled: row.enabled, datasetId: row.dataset_id,
  };
}
function service(row) {
  return { id: row.id, name: row.name, categoryId: row.category_id, group: row.service_group, kind: row.kind, summary: row.summary, description: row.description };
}
function hospitalService(row) {
  return { id: row.id, hospitalId: row.hospital_id, serviceId: row.service_id, available: row.available, bookingEnabled: row.booking_enabled, requiresPrescription: row.requires_prescription, reportTurnaround: row.report_turnaround, preparationInstructions: row.preparation_instructions, prerequisiteServiceIds: row.prerequisite_service_ids || [] };
}
function price(row) {
  return row ? { id: row.id, hospitalId: row.hospital_id, serviceId: row.service_id, finalPayablePaise: row.final_payable_paise, taxesAndFeesPaise: row.taxes_and_fees_paise, verificationStatus: row.verification_status, lastVerifiedOn: row.last_verified_on, conditions: row.conditions } : null;
}
function patient(row) {
  return { id: row.id, ownerUserId: row.owner_user_id, fullName: row.full_name, dateOfBirth: row.date_of_birth, gender: row.gender, phone: row.phone, email: row.email, relationship: row.relationship, address: row.address, emergencyContact: row.emergency_contact, identity: row.identity_kind ? { kind: row.identity_kind, masked: row.identity_masked, consentedAt: row.identity_consented_at } : null, createdAt: row.created_at };
}
function booking(row) {
  return { id: row.id, reference: row.reference, userId: row.user_id, patientId: row.patient_id, hospitalId: row.hospital_id, serviceId: row.service_id, hospitalServiceId: row.hospital_service_id, status: row.status, appointmentStartsAt: row.appointment_starts_at, appointmentEndsAt: row.appointment_ends_at, scheduleSource: row.schedule_source, paymentId: row.payment_id, invoiceId: row.invoice_id, prescriptionDocumentId: row.prescription_document_id, totalPayablePaise: row.total_payable_paise, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function userRecord(userId) {
  const result = await query("select id, role from eupchar_users where id = $1", [userId]);
  if (!result.rowCount) throw new HttpError(403, "Your account has not been provisioned for E-UPCHAR yet.", "ACCOUNT_NOT_PROVISIONED");
  return result.rows[0];
}
async function authenticated(request) { const identity = requireAuthenticatedUser(request); return { ...identity, ...(await userRecord(identity.id)) }; }
async function admin(request) { const user = await authenticated(request); if (user.role !== "admin") throw new HttpError(403, "Administrator access is required.", "FORBIDDEN"); return user; }

async function listHospitals(params) {
  const state = text(params.get("state"), "State", { required: false, max: 80 });
  const district = text(params.get("district"), "District", { required: false, max: 80 });
  const search = text(params.get("q"), "Search", { required: false, max: 80 });
  const serviceId = text(params.get("serviceId"), "Service", { required: false, max: 120 });
  const limit = limitFrom(params.get("limit"), 40, 100);
  const values = [];
  const where = ["h.enabled = true"];
  if (state) { values.push(state); where.push(`h.state ilike $${values.length}`); }
  if (district) { values.push(district); where.push(`h.district ilike $${values.length}`); }
  if (search) { values.push(`%${search}%`); where.push(`(h.name ilike $${values.length} or coalesce(h.city, '') ilike $${values.length} or h.district ilike $${values.length})`); }
  if (serviceId) { values.push(serviceId); where.push(`exists (select 1 from eupchar_hospital_services hs where hs.hospital_id = h.id and hs.service_id = $${values.length} and hs.available = true)`); }
  values.push(limit);
  const result = await query(`select h.* from eupchar_hospitals h where ${where.join(" and ")} order by h.name asc limit $${values.length}`, values);
  return { hospitals: result.rows.map(hospital), total: result.rowCount, filters: { state, district, q: search, serviceId, limit } };
}

async function getHospital(id) {
  const result = await query("select * from eupchar_hospitals where id = $1 and enabled = true", [id]);
  if (!result.rowCount) throw new HttpError(404, "Hospital not found or listing disabled.", "NOT_FOUND");
  const services = await query(`select hs.*, s.name as service_name, s.category_id, s.service_group, s.kind, s.summary, s.description,
      p.id as price_id, p.final_payable_paise, p.taxes_and_fees_paise, p.verification_status, p.last_verified_on, p.conditions
    from eupchar_hospital_services hs join eupchar_services s on s.id = hs.service_id
    left join eupchar_service_prices p on p.hospital_id = hs.hospital_id and p.service_id = hs.service_id
    where hs.hospital_id = $1 and hs.available = true order by s.name`, [id]);
  return { hospital: hospital(result.rows[0]), services: services.rows.map((row) => ({ ...hospitalService(row), service: service(row), price: price(row.price_id ? { ...row, id: row.price_id } : null) })) };
}

async function getService(id) {
  const found = await query("select * from eupchar_services where id = $1", [id]);
  if (!found.rowCount) throw new HttpError(404, "Service not found.", "NOT_FOUND");
  const providers = await query(`select h.*, hs.*, p.id as price_id, p.final_payable_paise, p.taxes_and_fees_paise, p.verification_status, p.last_verified_on, p.conditions
    from eupchar_hospital_services hs join eupchar_hospitals h on h.id = hs.hospital_id
    left join eupchar_service_prices p on p.hospital_id = hs.hospital_id and p.service_id = hs.service_id
    where hs.service_id = $1 and hs.available = true and h.enabled = true order by h.name`, [id]);
  return { service: service(found.rows[0]), hospitals: providers.rows.map((row) => ({ hospital: hospital(row), hospitalService: hospitalService(row), price: price(row.price_id ? { ...row, id: row.price_id } : null) })) };
}

async function listSlots(params) {
  const hospitalId = text(params.get("hospitalId"), "Hospital ID");
  const serviceId = text(params.get("serviceId"), "Service ID");
  const rows = await query(`select id, hospital_id, service_id, starts_at, ends_at, capacity, booked, source
    from eupchar_appointment_slots where hospital_id = $1 and service_id = $2 and starts_at > now() and booked < capacity order by starts_at limit 80`, [hospitalId, serviceId]);
  return { slots: rows.rows.map((row) => ({ id: row.id, hospitalId: row.hospital_id, serviceId: row.service_id, startsAt: row.starts_at, endsAt: row.ends_at, capacity: row.capacity, booked: row.booked, source: row.source })) };
}

async function listPatients(user) {
  const rows = await query("select * from eupchar_patients where owner_user_id = $1 order by created_at desc", [user.id]);
  return { patients: rows.rows.map(patient) };
}

async function createPatient(user, body) {
  const fullName = text(body.fullName, "Patient name", { min: 2, max: 120 });
  const dateOfBirth = text(body.dateOfBirth, "Date of birth", { min: 10, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || new Date(`${dateOfBirth}T00:00:00Z`).getTime() > Date.now()) throw new HttpError(400, "Enter a valid past date of birth.", "VALIDATION");
  const gender = oneOf(body.gender, "Gender", GENDERS);
  const relationship = oneOf(body.relationship || "self", "Relationship", RELATIONSHIPS);
  const mobile = phone(body.phone, "Patient telephone");
  const email = optionalEmail(body.email);
  const address = text(body.address, "Address", { required: false, max: 400 });
  const emergencyContact = body.emergencyContact ? phone(body.emergencyContact, "Emergency contact") : null;
  const identity = body.identity && typeof body.identity === "object" ? body.identity : null;
  const identityKind = identity ? oneOf(identity.kind, "Identity type", ["aadhaar_last4", "pmjay_card_last4", "other_id_last4"]) : null;
  const identityMasked = identity ? text(identity.masked, "Masked identity", { min: 4, max: 40 }) : null;
  if (identityMasked && !/^[^0-9]*[0-9]{4}$/.test(identityMasked)) throw new HttpError(400, "Only a masked identity ending in four digits may be stored.", "VALIDATION");
  const result = await query(`insert into eupchar_patients (owner_user_id, full_name, date_of_birth, gender, phone, email, relationship, address, emergency_contact, identity_kind, identity_masked, identity_consented_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`, [user.id, fullName, dateOfBirth, gender, mobile, email, relationship, address, emergencyContact, identityKind, identityMasked, identity ? new Date().toISOString() : null]);
  return { patient: patient(result.rows[0]) };
}

function bookingReference() { return `EUP-${new Date().getFullYear()}-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`; }
async function createBooking(user, body) {
  const patientId = text(body.patientId, "Patient"); const hospitalId = text(body.hospitalId, "Hospital"); const serviceId = text(body.serviceId, "Service");
  const notes = text(body.notes, "Booking note", { required: false, max: 1000 });
  const slotId = text(body.slotId, "Appointment slot", { required: false, max: 80 });
  const idempotencyKey = text(body.idempotencyKey, "Idempotency key", { required: false, max: 120 });
  return withTransaction(async (client) => {
    if (idempotencyKey) {
      const existing = await client.query("select * from eupchar_bookings where user_id = $1 and idempotency_key = $2", [user.id, idempotencyKey]);
      if (existing.rowCount) return { booking: booking(existing.rows[0]), duplicate: true };
    }
    const ownsPatient = await client.query("select id from eupchar_patients where id = $1 and owner_user_id = $2", [patientId, user.id]);
    if (!ownsPatient.rowCount) throw new HttpError(404, "Patient not found in your account.", "NOT_FOUND");
    const offering = await client.query(`select hs.*, p.final_payable_paise, p.verification_status from eupchar_hospital_services hs
      left join eupchar_service_prices p on p.hospital_id = hs.hospital_id and p.service_id = hs.service_id
      join eupchar_hospitals h on h.id = hs.hospital_id and h.enabled = true
      where hs.hospital_id = $1 and hs.service_id = $2 and hs.available = true and hs.booking_enabled = true for update`, [hospitalId, serviceId]);
    if (!offering.rowCount) throw new HttpError(409, "Online booking is not available for this hospital service. Use the verified hospital contact instead.", "BOOKING_NOT_AVAILABLE");
    const offer = offering.rows[0];
    if (offer.requires_prescription && !body.prescriptionDocumentId) {
      throw new HttpError(400, "This service requires a prescription before a booking request can be submitted.", "PRESCRIPTION_REQUIRED");
    }
    let startsAt = null; let endsAt = null; let scheduleSource = "not_connected";
    if (slotId) {
      const slot = await client.query("select * from eupchar_appointment_slots where id = $1 and hospital_id = $2 and service_id = $3 for update", [slotId, hospitalId, serviceId]);
      if (!slot.rowCount || new Date(slot.rows[0].starts_at).getTime() <= Date.now() || slot.rows[0].booked >= slot.rows[0].capacity) throw new HttpError(409, "This appointment time is unavailable. Refresh and choose another slot.", "SLOT_UNAVAILABLE");
      await client.query("update eupchar_appointment_slots set booked = booked + 1 where id = $1", [slotId]);
      startsAt = slot.rows[0].starts_at; endsAt = slot.rows[0].ends_at; scheduleSource = slot.rows[0].source;
    }
    const price = offer.verification_status === "verified" ? offer.final_payable_paise : null;
    const inserted = await client.query(`insert into eupchar_bookings (reference, user_id, patient_id, hospital_id, service_id, hospital_service_id, status, appointment_starts_at, appointment_ends_at, schedule_source, total_payable_paise, notes, idempotency_key)
      values ($1,$2,$3,$4,$5,$6,'requested',$7,$8,$9,$10,$11,$12) returning *`, [bookingReference(), user.id, patientId, hospitalId, serviceId, offer.id, startsAt, endsAt, scheduleSource, price, notes, idempotencyKey]);
    return { booking: booking(inserted.rows[0]), duplicate: false };
  });
}

async function listBookings(user) {
  const rows = await query("select * from eupchar_bookings where user_id = $1 order by created_at desc", [user.id]);
  return { bookings: rows.rows.map(booking) };
}
async function getBooking(user, id) {
  const rows = await query("select * from eupchar_bookings where id = $1 and user_id = $2", [id, user.id]);
  if (!rows.rowCount) throw new HttpError(404, "Booking not found.", "NOT_FOUND");
  return { booking: booking(rows.rows[0]) };
}
async function cancelBooking(user, id) {
  const updated = await query(`update eupchar_bookings set status = 'cancelled', updated_at = now() where id = $1 and user_id = $2 and status in ('requested','pending_hospital_confirmation') returning *`, [id, user.id]);
  if (!updated.rowCount) throw new HttpError(409, "This booking cannot be cancelled online in its current status.", "NOT_CANCELLABLE");
  return { booking: booking(updated.rows[0]) };
}

async function createPaymentOrder(user, body) {
  const bookingId = text(body.bookingId, "Booking");
  const rows = await query("select * from eupchar_bookings where id = $1 and user_id = $2", [bookingId, user.id]);
  if (!rows.rowCount) throw new HttpError(404, "Booking not found.", "NOT_FOUND");
  const row = rows.rows[0];
  if (!Number.isInteger(Number(row.total_payable_paise)) || Number(row.total_payable_paise) <= 0) throw new HttpError(409, "This booking has no verified amount, so online payment cannot start.", "PRICE_NOT_VERIFIED");
  const order = await createOrder({ amountPaise: Number(row.total_payable_paise), receipt: row.reference });
  await query(`insert into eupchar_payments (booking_id, provider, provider_order_id, amount_paise, status, sandbox)
    values ($1,'razorpay',$2,$3,'created',false) on conflict (booking_id) do update set provider_order_id = excluded.provider_order_id, amount_paise = excluded.amount_paise, status = 'created', updated_at = now()`, [bookingId, order.orderId, order.amountPaise]);
  return order;
}
async function verifyBookingPayment(user, body) {
  const bookingId = text(body.bookingId, "Booking"); const orderId = text(body.orderId, "Order");
  const bookingRows = await query("select id from eupchar_bookings where id = $1 and user_id = $2", [bookingId, user.id]);
  if (!bookingRows.rowCount) throw new HttpError(404, "Booking not found.", "NOT_FOUND");
  const payment = await verifyPayment({ orderId, providerPaymentId: body.providerPaymentId, signature: body.signature });
  const status = payment.status === "paid" ? "paid" : payment.status === "failed" ? "failed" : "pending";
  await withTransaction(async (client) => {
    const saved = await client.query("update eupchar_payments set provider_payment_id = $2, status = $3, updated_at = now() where booking_id = $1 and provider_order_id = $4 returning id", [bookingId, body.providerPaymentId || null, status, orderId]);
    if (!saved.rowCount) throw new HttpError(409, "No matching payment order is pending for this booking.", "PAYMENT_NOT_FOUND");
    if (status === "paid") {
      // Payment verification does not mean a hospital has accepted the booking.
      await client.query("update eupchar_bookings set status = 'pending_hospital_confirmation', payment_id = $2, updated_at = now() where id = $1", [bookingId, saved.rows[0].id]);
      const issued = await client.query(`insert into eupchar_invoices (invoice_number, booking_id, document_type, amount_paise, payment_status, payment_reference, sandbox)
        select $1, b.id, 'medipal_payment_receipt', b.total_payable_paise, 'paid', p.provider_payment_id, false from eupchar_bookings b join eupchar_payments p on p.id = $2 where b.id = $3
        on conflict (booking_id) do update set payment_status = excluded.payment_status, payment_reference = excluded.payment_reference
        returning id`, [`MED-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`, saved.rows[0].id, bookingId]);
      await client.query("update eupchar_bookings set invoice_id = $2, updated_at = now() where id = $1", [bookingId, issued.rows[0].id]);
    }
  });
  return payment;
}

async function upsertHospitalService(body) {
  const hospitalId = text(body.hospitalId, "Hospital"); const serviceId = text(body.serviceId, "Service");
  const result = await query(`insert into eupchar_hospital_services (hospital_id, service_id, available, booking_enabled, requires_prescription, report_turnaround, preparation_instructions)
    values ($1,$2,$3,$4,$5,$6,$7) on conflict (hospital_id, service_id) do update set available = excluded.available, booking_enabled = excluded.booking_enabled, requires_prescription = excluded.requires_prescription, report_turnaround = excluded.report_turnaround, preparation_instructions = excluded.preparation_instructions, updated_at = now() returning *`, [hospitalId, serviceId, body.available !== false, body.bookingEnabled === true, body.requiresPrescription === true, text(body.reportTurnaround, "Report turnaround", { required: false, max: 200 }), text(body.preparationInstructions, "Preparation instructions", { required: false, max: 2000 })]);
  return { hospitalService: hospitalService(result.rows[0]) };
}
async function upsertPrice(body) {
  const hospitalId = text(body.hospitalId, "Hospital"); const serviceId = text(body.serviceId, "Service"); const amount = Number(body.finalPayablePaise);
  if (!Number.isInteger(amount) || amount < 0) throw new HttpError(400, "Final payable amount must be a non-negative integer in paise.", "VALIDATION");
  const status = oneOf(body.verificationStatus, "Price status", ["verified", "unverified"]);
  if (status === "verified" && (!body.sourceName || !body.lastVerifiedOn)) throw new HttpError(400, "A verified price needs a source name and verification date.", "VALIDATION");
  const sourceId = status === "verified" ? `admin-${randomUUID()}` : null;
  if (sourceId) await query("insert into eupchar_price_sources (id, name, url, permitted) values ($1,$2,$3,true)", [sourceId, text(body.sourceName, "Price source", { min: 2, max: 200 }), text(body.sourceUrl, "Price source URL", { required: false, max: 500 })]);
  const result = await query(`insert into eupchar_service_prices (hospital_id, service_id, final_payable_paise, taxes_and_fees_paise, source_id, last_verified_on, conditions, verification_status)
    values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (hospital_id, service_id) do update set final_payable_paise = excluded.final_payable_paise, taxes_and_fees_paise = excluded.taxes_and_fees_paise, source_id = excluded.source_id, last_verified_on = excluded.last_verified_on, conditions = excluded.conditions, verification_status = excluded.verification_status, updated_at = now() returning *`, [hospitalId, serviceId, amount, Number.isInteger(Number(body.taxesAndFeesPaise)) ? Number(body.taxesAndFeesPaise) : null, sourceId, status === "verified" ? body.lastVerifiedOn : null, text(body.conditions, "Price conditions", { required: false, max: 1000 }), status]);
  return { price: price(result.rows[0]) };
}

export async function handleEupcharRoute(request, response, url) {
  const { pathname } = url; const method = request.method;
  requireDatabase();
  if (method === "GET" && pathname === "/api/e-upchar/hospitals") { sendJson(response, 200, await listHospitals(url.searchParams)); return true; }
  if (method === "GET" && pathname.startsWith("/api/e-upchar/hospitals/")) { sendJson(response, 200, await getHospital(decodeURIComponent(pathname.slice(24)))); return true; }
  if (method === "GET" && pathname.startsWith("/api/e-upchar/services/")) { sendJson(response, 200, await getService(decodeURIComponent(pathname.slice(23)))); return true; }
  if (method === "GET" && pathname === "/api/e-upchar/slots") { sendJson(response, 200, await listSlots(url.searchParams)); return true; }
  if (method === "GET" && pathname === "/api/e-upchar/patients") { sendJson(response, 200, await listPatients(await authenticated(request))); return true; }
  if (method === "POST" && pathname === "/api/e-upchar/patients") { sendJson(response, 201, await createPatient(await authenticated(request), await readJsonBody(request))); return true; }
  if (method === "GET" && pathname === "/api/e-upchar/bookings") { sendJson(response, 200, await listBookings(await authenticated(request))); return true; }
  if (method === "POST" && pathname === "/api/e-upchar/bookings") { const user = await authenticated(request); enforceRateLimit(`eupchar-booking:${user.id}`, { max: 8 }); const body = await readJsonBody(request); body.idempotencyKey = request.headers["idempotency-key"] || body.idempotencyKey; const result = await createBooking(user, body); sendJson(response, result.duplicate ? 200 : 201, result); return true; }
  if (method === "GET" && pathname.startsWith("/api/e-upchar/bookings/")) { sendJson(response, 200, await getBooking(await authenticated(request), decodeURIComponent(pathname.slice(23)))); return true; }
  if (method === "POST" && pathname.endsWith("/cancel") && pathname.startsWith("/api/e-upchar/bookings/")) { sendJson(response, 200, await cancelBooking(await authenticated(request), decodeURIComponent(pathname.slice(23, -7)))); return true; }
  if (method === "POST" && pathname === "/api/e-upchar/payments/create-order") { const user = await authenticated(request); enforceRateLimit(`eupchar-payment:${user.id}`, { max: 10 }); sendJson(response, 200, await createPaymentOrder(user, await readJsonBody(request))); return true; }
  if (method === "POST" && pathname === "/api/e-upchar/payments/verify") { const user = await authenticated(request); enforceRateLimit(`eupchar-payment-verify:${user.id}`, { max: 10 }); sendJson(response, 200, await verifyBookingPayment(user, await readJsonBody(request))); return true; }
  if (pathname.startsWith("/api/e-upchar/admin/")) {
    await admin(request);
    if (method === "POST" && pathname === "/api/e-upchar/admin/hospital-services") { sendJson(response, 200, await upsertHospitalService(await readJsonBody(request))); return true; }
    if (method === "POST" && pathname === "/api/e-upchar/admin/service-prices") { sendJson(response, 200, await upsertPrice(await readJsonBody(request))); return true; }
  }
  return false;
}
