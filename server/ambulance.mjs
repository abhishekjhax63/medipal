/**
 * MEDIPAL · Ambulance route module.
 *
 * What this module refuses to do, on purpose:
 *
 *  - It never invents a vehicle. Every provider row is a real operator record
 *    entered by the MEDIPAL team, and only `status = 'approved'` rows are ever
 *    returned to the public.
 *  - It never invents availability, a fare or an arrival time. Those live on
 *    `ambulance_provider_services` per provider per category, with the source of
 *    the claim and the moment it was confirmed. A claim with no confirmation
 *    timestamp is reported as unconfirmed.
 *  - It never advances a booking on its own. The statuses that describe what a
 *    vehicle is doing (`accepted` … `completed`) can only be written when the
 *    caller states they came from a provider dispatch feed or a recorded
 *    operator telephone confirmation. MEDIPAL itself can only cancel or mark a
 *    request unfulfillable.
 *  - It never simulates a moving ambulance. Live position is exposed only when a
 *    provider actually runs a dispatch feed (`tracking_mode`), which no provider
 *    does until the MEDIPAL team configures one.
 *
 * A user only ever sees their own booking, and only after proving they hold the
 * reference AND the contact number it was made with.
 */

import { config } from "./env.mjs";
import { query, withTransaction, dbConfigured } from "./db.mjs";
import { sendJson, readJsonBody, HttpError } from "./http.mjs";
import {
  text,
  oneOf,
  phone,
  dialablePhone,
  optionalEmail,
  postalCode,
  optionalInteger,
  optionalCoordinate,
  coordinate,
  limitFrom,
  safeEqual,
} from "./validate.mjs";
import { enforceRateLimit } from "./rate-limit.mjs";

// -----------------------------------------------------------------------------
// Controlled vocabularies (mirrors db/migrations/004_ambulance.sql)
// -----------------------------------------------------------------------------

export const AMBULANCE_CATEGORIES = [
  "Basic Life Support (BLS)",
  "Advanced Life Support (ALS)",
  "Patient Transport Vehicle (PTV)",
  "Other Locally Available Service",
];

export const AMBULANCE_URGENCIES = ["emergency", "non_emergency"];

export const AMBULANCE_NEEDS = [
  "wheelchair",
  "stretcher",
  "oxygen",
  "cardiac_monitor",
  "neonatal_incubator",
  "trained_attendant",
  "isolation",
];

export const AMBULANCE_AVAILABILITY = ["available", "limited", "unavailable", "unknown"];

export const AMBULANCE_PROVIDER_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "suspended",
];

export const AMBULANCE_BOOKING_STATUSES = [
  "requested",
  "accepted",
  "assigned",
  "dispatched",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
  "unable_to_fulfil",
];

/** Statuses that describe what a vehicle is doing, not what MEDIPAL decided. */
const PROVIDER_ATTESTED_STATUSES = [
  "accepted",
  "assigned",
  "dispatched",
  "en_route",
  "arrived",
  "completed",
];

const BOOKING_EVENT_SOURCES = [
  "medipal",
  "provider_dispatch_feed",
  "provider_phone_confirmation",
  "patient",
];

const ALLOWED_BOOKING_TRANSITIONS = {
  requested: ["accepted", "cancelled", "unable_to_fulfil"],
  accepted: ["assigned", "dispatched", "cancelled", "unable_to_fulfil"],
  assigned: ["dispatched", "cancelled", "unable_to_fulfil"],
  dispatched: ["en_route", "arrived", "cancelled"],
  en_route: ["arrived", "cancelled"],
  arrived: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  unable_to_fulfil: [],
};

/** A requester can still call off a request that nobody has driven out for yet. */
const PATIENT_CANCELLABLE = ["requested", "accepted", "assigned"];

const PICKUP_SOURCES = ["browser_geolocation", "manual", "geocoded", "map_pin"];

export const AMBULANCE_DISCLAIMER =
  "MEDIPAL is not an ambulance operator and not an emergency dispatch service. " +
  "Booking a vehicle here records a request with the operator you choose; it does " +
  "not summon help by itself. For a life-threatening emergency, telephone 112 (or " +
  "the ambulance number for your state, commonly 108) first, then use MEDIPAL if " +
  "you still need to arrange transport.";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function recordAudit(client, { actor, action, entity, entityId = null, detail = null }) {
  const run = client ? client.query.bind(client) : query;
  try {
    await run(
      `insert into ambulance_audit_logs (actor, action, entity, entity_id, detail)
       values ($1, $2, $3, $4, $5)`,
      [actor, action, entity, entityId, detail],
    );
  } catch (error) {
    console.error(`[medipal] ambulance audit write failed (${action}/${entity}): ${error.message}`);
    throw error;
  }
}

async function appendEvent(client, { bookingId, status, actor, source, note = null }) {
  await client.query(
    `insert into ambulance_booking_events (booking_id, status, actor, source, note)
     values ($1, $2, $3, $4, $5)`,
    [bookingId, status, actor, source, note],
  );
}

function requireDatabase() {
  if (!dbConfigured) {
    throw new HttpError(
      503,
      "The ambulance database is not configured on this server. Set DATABASE_URL in " +
        "`.env.server` and run `npm run db:setup`.",
      "DB_NOT_CONFIGURED",
    );
  }
}

function requireAmbulanceAdmin(request) {
  if (!config.blood.adminKey) {
    throw new HttpError(
      503,
      "The platform-admin console is not configured on this server. Set BLOOD_ADMIN_KEY in `.env.server`.",
      "ADMIN_NOT_CONFIGURED",
    );
  }
  const supplied = request.headers["x-medipal-admin-key"];
  if (!safeEqual(supplied, config.blood.adminKey)) {
    throw new HttpError(401, "The platform-admin key is missing or incorrect.", "UNAUTHENTICATED");
  }
}

/** Shown wherever a patient could otherwise mistake a request for a dispatch. */
const ACCEPTANCE_NOTE =
  "This is a recorded request only. No vehicle has been assigned yet — the operator " +
  "confirms acceptance by telephone or through their own dispatch system, and the " +
  "status here changes only when that confirmation is recorded.";

function serialiseProvider(row, coverage) {
  return {
    id: row.id,
    reference: row.public_ref,
    name: row.name,
    providerType: row.provider_type,
    contactPhone: row.emergency_hotline || row.contact_phone,
    alternatePhone: row.alternate_phone,
    emergencyHotline: row.emergency_hotline,
    address: row.address,
    city: row.city,
    district: row.district,
    state: row.state,
    postalCode: row.postal_code,
    latitude: row.latitude,
    longitude: row.longitude,
    coordinatesVerified: row.coordinates_verified,
    serviceArea: row.service_area,
    operatingHours: row.operating_hours,
    trackingMode: row.tracking_mode,
    liveTrackingAvailable: row.tracking_mode !== "phone_only" && Boolean(row.dispatch_integration),
    dataSourceId: row.data_source_id,
    sourceNote: row.source_note,
    lastVerifiedAt: row.last_verified_at,
    categories: coverage.map((item) => ({
      category: item.category,
      availability: item.availability,
      availabilitySource: item.availability_source,
      baseFarePaise: item.base_fare_paise,
      perKmPaise: item.per_km_paise,
      estimatedResponseMinutes: item.estimated_response_minutes,
      notes: item.notes,
      lastConfirmedAt: item.last_confirmed_at,
      /** A claim is only "confirmed" when it carries the moment it was given. */
      confirmed: Boolean(item.last_confirmed_at) && item.availability_source !== "not_confirmed",
    })),
  };
}

function serialiseBooking(row) {
  return {
    reference: row.public_ref,
    category: row.category,
    urgency: row.urgency,
    status: row.status,
    statusUpdatedAt: row.status_updated_at,
    patientName: row.patient_name,
    contactPhone: row.contact_phone,
    patientAge: row.patient_age,
    patientSex: row.patient_sex,
    needs: row.needs ?? [],
    pickup: {
      address: row.pickup_address,
      landmark: row.pickup_landmark,
      latitude: row.pickup_latitude,
      longitude: row.pickup_longitude,
      accuracyMeters: row.pickup_accuracy_meters,
      source: row.pickup_source,
    },
    destination: {
      name: row.destination_name,
      address: row.destination_address,
      phone: row.destination_phone,
      latitude: row.destination_latitude,
      longitude: row.destination_longitude,
    },
    notes: row.notes,
    consentToShare: row.consent_to_share,
    sharedWithProviderAt: row.share_with_provider_at,
    providerId: row.provider_id,
    providerReference: row.provider_ref ?? null,
    providerName: row.provider_name ?? null,
    providerPhone: row.provider_phone ?? null,
    cancelledAt: row.cancelled_at,
    cancelledReason: row.cancelled_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// -----------------------------------------------------------------------------
// Public reads
// -----------------------------------------------------------------------------

async function listSources() {
  const result = await query(
    `select id, name, source_type, provider, url, verification_status,
            requires_registration, notes, is_active
       from ambulance_data_sources
      where is_active = true
      order by id`,
  );
  return result.rows;
}

async function listEmergencyContacts() {
  const result = await query(
    `select id, label, number, scope, region, url, notes, sort_order
       from ambulance_emergency_contacts
      where is_active = true
      order by sort_order asc, number asc`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    number: row.number,
    /** `tel:` target the client may use; a plain telephone call, nothing more. */
    dial: `tel:${row.number}`,
    scope: row.scope,
    region: row.region,
    url: row.url,
    notes: row.notes,
  }));
}

async function coverageSummary() {
  const result = await query(
    `select category,
            sum(providers_available)::integer as providers_available,
            sum(providers_limited)::integer   as providers_limited,
            sum(providers_total)::integer     as providers_total,
            max(last_confirmed_at)            as last_confirmed_at
       from ambulance_category_coverage
      group by category
      order by category`,
  );
  const byCategory = new Map(result.rows.map((row) => [row.category, row]));
  return AMBULANCE_CATEGORIES.map((category) => {
    const row = byCategory.get(category);
    return {
      category,
      providersAvailable: row?.providers_available ?? 0,
      providersLimited: row?.providers_limited ?? 0,
      providersTotal: row?.providers_total ?? 0,
      lastConfirmedAt: row?.last_confirmed_at ?? null,
    };
  });
}

async function coverageDetail(params) {
  const category = oneOf(params.get("category"), "Ambulance category", AMBULANCE_CATEGORIES, {
    required: false,
  });
  const state = text(params.get("state"), "State", { required: false, max: 80 });
  const district = text(params.get("district"), "District", { required: false, max: 80 });

  const conditions = [];
  const values = [];
  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }
  if (state) {
    values.push(state);
    conditions.push(`state ilike $${values.length}`);
  }
  if (district) {
    values.push(district);
    conditions.push(`district ilike $${values.length}`);
  }

  const result = await query(
    `select category, state, district, providers_available, providers_limited,
            providers_total, last_confirmed_at
       from ambulance_category_coverage
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by category asc, state asc nulls last, district asc nulls last
      limit 500`,
    values,
  );

  return result.rows.map((row) => ({
    category: row.category,
    state: row.state,
    district: row.district,
    providersAvailable: row.providers_available,
    providersLimited: row.providers_limited,
    providersTotal: row.providers_total,
    lastConfirmedAt: row.last_confirmed_at,
  }));
}

async function listPublicProviders(params) {
  const category = oneOf(params.get("category"), "Ambulance category", AMBULANCE_CATEGORIES, {
    required: false,
  });
  const state = text(params.get("state"), "State", { required: false, max: 80 });
  const district = text(params.get("district"), "District", { required: false, max: 80 });
  const search = text(params.get("q"), "Search", { required: false, max: 80 });
  const limit = limitFrom(params.get("limit"), 40, 100);

  const conditions = [];
  const values = [];

  if (category) {
    values.push(category);
    conditions.push(
      `exists (select 1 from ambulance_provider_services s
                where s.provider_id = p.id and s.category = $${values.length})`,
    );
  }
  if (state) {
    values.push(state);
    conditions.push(`p.state ilike $${values.length}`);
  }
  if (district) {
    values.push(district);
    conditions.push(`p.district ilike $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(
      `(p.name ilike $${values.length} or coalesce(p.city, '') ilike $${values.length}
        or coalesce(p.district, '') ilike $${values.length}
        or coalesce(p.service_area, '') ilike $${values.length})`,
    );
  }
  values.push(limit);

  const providers = await query(
    `select p.* from ambulance_public_providers p
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by p.name asc
      limit $${values.length}`,
    values,
  );

  const ids = providers.rows.map((row) => row.id);
  const coverageRows = ids.length
    ? (
        await query(
          `select * from ambulance_provider_services
            where provider_id = any($1::uuid[])
            order by category asc`,
          [ids],
        )
      ).rows
    : [];

  const grouped = new Map();
  for (const item of coverageRows) {
    const bucket = grouped.get(item.provider_id) ?? [];
    bucket.push(item);
    grouped.set(item.provider_id, bucket);
  }

  const rows = providers.rows
    .map((row) => serialiseProvider(row, grouped.get(row.id) ?? []))
    .filter((row) => (category ? row.categories.some((entry) => entry.category === category) : true));

  return {
    providers: rows,
    total: rows.length,
    filters: { category, state, district, q: search, limit },
    /**
     * Stated explicitly in the payload so the UI cannot quietly imply otherwise.
     */
    availabilityNote:
      "Availability and fares below are the operator's own latest confirmation. " +
      "They are not a real-time feed and do not reserve a vehicle.",
  };
}

// -----------------------------------------------------------------------------
// Booking
// -----------------------------------------------------------------------------

function validateBookingInput(body) {
  const category = oneOf(body.category, "Ambulance category", AMBULANCE_CATEGORIES);
  const urgency = oneOf(body.urgency, "Urgency", AMBULANCE_URGENCIES);

  const patientName = text(body.patientName, "Patient name", { min: 2, max: 120 });
  const contactPhone = phone(body.contactPhone, "Contact number");
  const patientAge = optionalInteger(body.patientAge, "Patient age", { min: 0, max: 130 });
  const patientSex = oneOf(body.patientSex, "Patient sex", ["female", "male", "other", "undisclosed"], {
    required: false,
  });

  const rawNeeds = body.needs === undefined || body.needs === null ? [] : body.needs;
  if (!Array.isArray(rawNeeds)) {
    throw new HttpError(400, "Transport needs must be a list.", "VALIDATION");
  }
  const needs = [...new Set(rawNeeds.map((item) => String(item)))];
  for (const need of needs) {
    if (!AMBULANCE_NEEDS.includes(need)) {
      throw new HttpError(400, `Unknown transport need: ${need}`, "VALIDATION");
    }
  }

  const pickupAddress = text(body.pickupAddress, "Pickup address", { min: 5, max: 400 });
  const pickupSource = oneOf(body.pickupSource, "Pickup source", PICKUP_SOURCES);
  const pickupLatitude = optionalCoordinate(body.pickupLatitude, "Pickup latitude", 90);
  const pickupLongitude = optionalCoordinate(body.pickupLongitude, "Pickup longitude", 180);
  if ((pickupLatitude === null) !== (pickupLongitude === null)) {
    throw new HttpError(
      400,
      "Provide both the pickup latitude and longitude, or neither.",
      "VALIDATION",
    );
  }
  const pickupAccuracyMeters = optionalInteger(body.pickupAccuracyMeters, "Location accuracy", {
    min: 0,
    max: 100_000,
  });
  const pickupLandmark = text(body.pickupLandmark, "Nearby landmark", { required: false, max: 200 });

  const destinationName = text(body.destinationName, "Destination hospital", {
    required: false,
    max: 200,
  });
  const destinationAddress = text(body.destinationAddress, "Destination address", {
    required: false,
    max: 400,
  });
  const destinationPhone =
    body.destinationPhone === undefined || body.destinationPhone === null || body.destinationPhone === ""
      ? null
      : dialablePhone(body.destinationPhone, "Destination telephone");
  const destinationLatitude = optionalCoordinate(body.destinationLatitude, "Destination latitude", 90);
  const destinationLongitude = optionalCoordinate(body.destinationLongitude, "Destination longitude", 180);
  if ((destinationLatitude === null) !== (destinationLongitude === null)) {
    throw new HttpError(
      400,
      "Provide both the destination latitude and longitude, or neither.",
      "VALIDATION",
    );
  }

  const notes = text(body.notes, "Notes", { required: false, max: 1000 });

  if (body.consentToShare !== true) {
    throw new HttpError(
      400,
      "Consent is required before the patient's contact details and pickup location can be shared with an operator.",
      "CONSENT_REQUIRED",
    );
  }

  const idempotencyKey = text(body.idempotencyKey, "Idempotency key", { required: false, max: 120 });

  return {
    idempotencyKey,
    category,
    urgency,
    patientName,
    contactPhone,
    patientAge,
    patientSex,
    needs,
    pickupAddress,
    pickupSource,
    pickupLatitude,
    pickupLongitude,
    pickupAccuracyMeters,
    pickupLandmark,
    destinationName,
    destinationAddress,
    destinationPhone,
    destinationLatitude,
    destinationLongitude,
    notes,
    consentToShare: true,
  };
}

async function createBooking(body) {
  const input = validateBookingInput(body);

  // A chosen operator must actually exist, be approved, and run the category.
  let provider = null;
  if (body.providerId !== undefined && body.providerId !== null && body.providerId !== "") {
    const providerId = text(body.providerId, "Provider", { min: 8, max: 64 });
    const found = await query(
      `select p.* from ambulance_public_providers p where p.id = $1`,
      [providerId],
    );
    provider = found.rows[0];
    if (!provider) {
      throw new HttpError(
        404,
        "That ambulance operator is not available. It may have been suspended since this page was loaded.",
        "PROVIDER_UNAVAILABLE",
      );
    }
    const coverage = await query(
      `select availability, last_confirmed_at from ambulance_provider_services
        where provider_id = $1 and category = $2`,
      [provider.id, input.category],
    );
    const row = coverage.rows[0];
    if (!row) {
      throw new HttpError(
        400,
        `${provider.name} does not list ${input.category}. Choose a category this operator actually runs.`,
        "CATEGORY_NOT_OFFERED",
      );
    }
    if (row.availability === "unavailable") {
      throw new HttpError(
        409,
        `${provider.name} currently reports ${input.category} as unavailable. Choose another operator or telephone them directly.`,
        "PROVIDER_UNAVAILABLE",
      );
    }
  }

  return withTransaction(async (client) => {
    if (input.idempotencyKey) {
      const existing = await client.query(
        `select b.*, p.public_ref as provider_ref, p.name as provider_name,
                coalesce(p.emergency_hotline, p.contact_phone) as provider_phone
           from ambulance_bookings b
           left join ambulance_providers p on p.id = b.provider_id
          where b.idempotency_key = $1`,
        [input.idempotencyKey],
      );
      if (existing.rowCount > 0) {
        return {
          booking: serialiseBooking(existing.rows[0]),
          duplicate: true,
          acceptanceNote: ACCEPTANCE_NOTE,
        };
      }
    }

    const inserted = await client.query(
      `insert into ambulance_bookings (
         idempotency_key, category, urgency, provider_id, patient_name, contact_phone,
         patient_age, patient_sex, needs, pickup_address, pickup_latitude, pickup_longitude,
         pickup_accuracy_meters, pickup_source, pickup_landmark, destination_name,
         destination_address, destination_phone, destination_latitude, destination_longitude,
         notes, consent_to_share, share_with_provider_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       ) returning *`,
      [
        input.idempotencyKey,
        input.category,
        input.urgency,
        provider?.id ?? null,
        input.patientName,
        input.contactPhone,
        input.patientAge,
        input.patientSex,
        input.needs,
        input.pickupAddress,
        input.pickupLatitude,
        input.pickupLongitude,
        input.pickupAccuracyMeters,
        input.pickupSource,
        input.pickupLandmark,
        input.destinationName,
        input.destinationAddress,
        input.destinationPhone,
        input.destinationLatitude,
        input.destinationLongitude,
        input.notes,
        true,
        provider ? new Date().toISOString() : null,
      ],
    );

    const booking = inserted.rows[0];

    await appendEvent(client, {
      bookingId: booking.id,
      status: "requested",
      actor: "patient",
      source: "patient",
      note: provider
        ? `Request recorded against ${provider.name}. Awaiting the operator's own confirmation.`
        : "Request recorded. No operator selected; the patient will arrange transport directly.",
    });

    await recordAudit(client, {
      actor: "patient",
      action: "ambulance_booking_created",
      entity: "ambulance_bookings",
      entityId: booking.public_ref,
      detail: { category: input.category, urgency: input.urgency, providerRef: provider?.public_ref ?? null },
    });

    return {
      booking: serialiseBooking({
        ...booking,
        provider_ref: provider?.public_ref ?? null,
        provider_name: provider?.name ?? null,
        provider_phone: provider ? provider.emergency_hotline || provider.contact_phone : null,
      }),
      duplicate: false,
      acceptanceNote: ACCEPTANCE_NOTE,
    };
  });
}

/** Loads a booking only when the caller proves the reference AND the number. */
async function loadBookingForRequester(reference, phoneValue) {
  const ref = text(reference, "Booking reference", { min: 4, max: 40 });
  const contactPhone = phone(phoneValue, "Contact number");
  const result = await query(
    `select b.*, p.public_ref as provider_ref, p.name as provider_name,
            coalesce(p.emergency_hotline, p.contact_phone) as provider_phone,
            p.tracking_mode, p.dispatch_integration
       from ambulance_bookings b
       left join ambulance_providers p on p.id = b.provider_id
      where b.public_ref = $1 and b.contact_phone = $2`,
    [ref.toUpperCase(), contactPhone],
  );
  if (result.rowCount === 0) {
    // One message for "no such reference" and "wrong number" alike, so the
    // endpoint cannot be used to discover which references exist.
    throw new HttpError(
      404,
      "No booking matches that reference and contact number.",
      "NOT_FOUND",
    );
  }
  return result.rows[0];
}

async function bookingEvents(bookingId) {
  const result = await query(
    `select status, actor, source, note, created_at
       from ambulance_booking_events
      where booking_id = $1
      order by created_at asc`,
    [bookingId],
  );
  return result.rows.map((row) => ({
    status: row.status,
    actor: row.actor,
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
  }));
}

async function trackBooking(reference, phoneValue) {
  const row = await loadBookingForRequester(reference, phoneValue);
  // A selected provider is not proof of a dispatch integration. Keeping this
  // condition in the booking lookup closes the gap between provider cards and
  // the tracking screen: the latter cannot imply live tracking just because an
  // operator was chosen.
  const liveTrackingAvailable =
    row.tracking_mode !== "phone_only" && Boolean(row.dispatch_integration);
  return {
    booking: serialiseBooking(row),
    events: await bookingEvents(row.id),
    /**
     * True only when the operator behind this booking actually runs a dispatch
     * feed. The UI must not draw a moving vehicle when this is false.
     */
    liveTrackingAvailable,
    acceptanceNote: ACCEPTANCE_NOTE,
  };
}

async function cancelBooking(reference, body) {
  const row = await loadBookingForRequester(reference, body.phone);

  if (!PATIENT_CANCELLABLE.includes(row.status)) {
    throw new HttpError(
      409,
      row.status === "cancelled"
        ? "This booking is already cancelled."
        : `A booking that is already ${row.status.replace(/_/g, " ")} cannot be cancelled here. Telephone the operator directly.`,
      "NOT_CANCELLABLE",
    );
  }

  const reason = text(body.reason, "Cancellation reason", { required: false, max: 300 });

  return withTransaction(async (client) => {
    const updated = await client.query(
      `update ambulance_bookings
          set status = 'cancelled',
              cancelled_at = now(),
              cancelled_reason = $2,
              status_updated_at = now()
        where id = $1 and status = any($3::ambulance_booking_status[])
        returning *`,
      [row.id, reason, PATIENT_CANCELLABLE],
    );

    if (updated.rowCount === 0) {
      throw new HttpError(
        409,
        "The booking changed while you were cancelling it. Reload the page to see its current status.",
        "CONFLICT",
      );
    }

    await appendEvent(client, {
      bookingId: row.id,
      status: "cancelled",
      actor: "patient",
      source: "patient",
      note: reason || "Cancelled by the requester.",
    });

    await recordAudit(client, {
      actor: "patient",
      action: "ambulance_booking_cancelled",
      entity: "ambulance_bookings",
      entityId: row.public_ref,
      detail: { reason: reason ?? null },
    });

    return {
      booking: serialiseBooking(updated.rows[0]),
      events: await bookingEvents(row.id),
    };
  });
}

// -----------------------------------------------------------------------------
// Admin
// -----------------------------------------------------------------------------

async function adminProviders(params) {
  const status = oneOf(params.get("status"), "Provider status", AMBULANCE_PROVIDER_STATUSES, {
    required: false,
  });
  const values = [];
  let where = "";
  if (status) {
    values.push(status);
    where = `where p.status = $${values.length}`;
  }
  const result = await query(
    `select p.*, count(s.id)::integer as category_count
       from ambulance_providers p
       left join ambulance_provider_services s on s.provider_id = p.id
       ${where}
      group by p.id
      order by p.created_at desc
      limit 200`,
    values,
  );

  const ids = result.rows.map((row) => row.id);
  const coverageRows = ids.length
    ? (
        await query(
          `select * from ambulance_provider_services where provider_id = any($1::uuid[]) order by category`,
          [ids],
        )
      ).rows
    : [];
  const grouped = new Map();
  for (const item of coverageRows) {
    const bucket = grouped.get(item.provider_id) ?? [];
    bucket.push(item);
    grouped.set(item.provider_id, bucket);
  }

  return {
    providers: result.rows.map((row) => {
      const serialised = serialiseProvider(row, grouped.get(row.id) ?? []);
      return {
        ...serialised,
        status: row.status,
        reviewNotes: row.review_notes,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        email: row.email,
        notes: row.notes,
        dispatchIntegration: row.dispatch_integration,
        createdAt: row.created_at,
      };
    }),
  };
}

async function createProvider(body, actor) {
  const name = text(body.name, "Operator name", { min: 2, max: 160 });
  const providerType = oneOf(body.providerType, "Operator type", [
    "Government",
    "Private",
    "NGO / Trust",
    "Hospital-owned",
  ]);
  const contactPhone = dialablePhone(body.contactPhone, "Operator telephone");
  const alternatePhone =
    body.alternatePhone === undefined || body.alternatePhone === null || body.alternatePhone === ""
      ? null
      : dialablePhone(body.alternatePhone, "Alternate telephone");
  const emergencyHotline =
    body.emergencyHotline === undefined || body.emergencyHotline === null || body.emergencyHotline === ""
      ? null
      : dialablePhone(body.emergencyHotline, "Emergency hotline");
  const email = optionalEmail(body.email);
  const address = text(body.address, "Address", { required: false, max: 400 });
  const city = text(body.city, "City", { required: false, max: 120 });
  const district = text(body.district, "District", { required: false, max: 120 });
  const state = text(body.state, "State", { required: false, max: 120 });
  const pin = postalCode(body.postalCode);
  const serviceArea = text(body.serviceArea, "Service area", { required: false, max: 400 });
  const operatingHours = text(body.operatingHours, "Operating hours", { required: false, max: 160 });
  const notes = text(body.notes, "Notes", { required: false, max: 1000 });

  let latitude = null;
  let longitude = null;
  let coordinatesVerified = false;
  if (body.latitude !== undefined && body.latitude !== null && body.latitude !== "") {
    latitude = coordinate(body.latitude, "Latitude", 90);
    longitude = coordinate(body.longitude, "Longitude", 180);
    coordinatesVerified = body.coordinatesVerified === true;
  }

  // A provider counts as MEDIPAL-verified only when a coordinator asserts it.
  const dataSourceId = coordinatesVerified ? "medipal_verified" : "provider_declared";

  const result = await query(
    `insert into ambulance_providers (
       name, provider_type, contact_phone, alternate_phone, emergency_hotline, email,
       address, city, district, state, postal_code, latitude, longitude, coordinates_verified,
       service_area, operating_hours, notes, data_source_id
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     returning *`,
    [
      name,
      providerType,
      contactPhone,
      alternatePhone,
      emergencyHotline,
      email,
      address,
      city,
      district,
      state,
      pin,
      latitude,
      longitude,
      coordinatesVerified,
      serviceArea,
      operatingHours,
      notes,
      dataSourceId,
    ],
  );

  await recordAudit(null, {
    actor,
    action: "ambulance_provider_created",
    entity: "ambulance_providers",
    entityId: result.rows[0].public_ref,
    detail: { name, providerType },
  });

  return { provider: serialiseProvider(result.rows[0], []) };
}

async function reviewProvider(body, actor) {
  const providerId = text(body.providerId, "Provider", { min: 8, max: 64 });
  const decision = oneOf(body.decision, "Decision", [
    "under_review",
    "approved",
    "rejected",
    "suspended",
  ]);
  const notes = text(body.notes, "Review note", { required: false, max: 500 });
  const verifiedOnSite = body.verifiedOnSite === true;

  if (decision === "approved" && !verifiedOnSite) {
    throw new HttpError(
      400,
      "Approving an operator requires an explicit confirmation that its contact number and service area were checked. Tick the attestation and try again.",
      "ATTESTATION_REQUIRED",
    );
  }

  const updated = await query(
    `update ambulance_providers
        set status = $2,
            review_notes = $3,
            reviewed_at = now(),
            reviewed_by = $4,
            last_verified_at = case when $2 = 'approved' then now() else last_verified_at end,
            data_source_id = case when $2 = 'approved' and $5 then 'medipal_verified' else data_source_id end
      where id = $1
      returning *`,
    [providerId, decision, notes, actor, verifiedOnSite],
  );

  if (updated.rowCount === 0) {
    throw new HttpError(404, "No ambulance operator with that id.", "NOT_FOUND");
  }

  await recordAudit(null, {
    actor,
    action: "ambulance_provider_reviewed",
    entity: "ambulance_providers",
    entityId: updated.rows[0].public_ref,
    detail: { decision, verifiedOnSite },
  });

  return { provider: { ...serialiseProvider(updated.rows[0], []), status: updated.rows[0].status } };
}

async function upsertProviderCoverage(body, actor) {
  const providerId = text(body.providerId, "Provider", { min: 8, max: 64 });
  const category = oneOf(body.category, "Ambulance category", AMBULANCE_CATEGORIES);
  const availability = oneOf(body.availability, "Availability", AMBULANCE_AVAILABILITY);
  const availabilitySource = oneOf(body.availabilitySource, "Availability source", [
    "provider_declared",
    "provider_dispatch_feed",
    "medipal_verified",
    "not_confirmed",
  ]);
  const baseFarePaise = optionalInteger(body.baseFarePaise, "Base fare", { min: 0, max: 10_000_000 });
  const perKmPaise = optionalInteger(body.perKmPaise, "Per-kilometre fare", { min: 0, max: 1_000_000 });
  const estimatedResponseMinutes = optionalInteger(body.estimatedResponseMinutes, "Response estimate", {
    min: 1,
    max: 1440,
  });
  const notes = text(body.notes, "Coverage note", { required: false, max: 500 });

  const provider = await query("select id, public_ref from ambulance_providers where id = $1", [
    providerId,
  ]);
  if (provider.rowCount === 0) {
    throw new HttpError(404, "No ambulance operator with that id.", "NOT_FOUND");
  }

  // A real claim needs a real timestamp. `not_confirmed` deliberately clears it.
  const confirmed = availabilitySource !== "not_confirmed";

  const result = await query(
    `insert into ambulance_provider_services (
       provider_id, category, availability, availability_source,
       base_fare_paise, per_km_paise, estimated_response_minutes, notes, last_confirmed_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8, case when $9 then now() else null end)
     on conflict (provider_id, category) do update
        set availability = excluded.availability,
            availability_source = excluded.availability_source,
            base_fare_paise = excluded.base_fare_paise,
            per_km_paise = excluded.per_km_paise,
            estimated_response_minutes = excluded.estimated_response_minutes,
            notes = excluded.notes,
            last_confirmed_at = case when $9 then now() else null end
     returning *`,
    [
      providerId,
      category,
      availability,
      availabilitySource,
      baseFarePaise,
      perKmPaise,
      estimatedResponseMinutes,
      notes,
      confirmed,
    ],
  );

  await recordAudit(null, {
    actor,
    action: "ambulance_coverage_updated",
    entity: "ambulance_provider_services",
    entityId: `${provider.rows[0].public_ref}:${category}`,
    detail: { availability, availabilitySource, confirmed },
  });

  return {
    coverage: {
      category: result.rows[0].category,
      availability: result.rows[0].availability,
      availabilitySource: result.rows[0].availability_source,
      baseFarePaise: result.rows[0].base_fare_paise,
      perKmPaise: result.rows[0].per_km_paise,
      estimatedResponseMinutes: result.rows[0].estimated_response_minutes,
      notes: result.rows[0].notes,
      lastConfirmedAt: result.rows[0].last_confirmed_at,
      confirmed: Boolean(result.rows[0].last_confirmed_at),
    },
  };
}

async function updateProviderTracking(body, actor) {
  const providerId = text(body.providerId, "Provider", { min: 8, max: 64 });
  const trackingMode = oneOf(body.trackingMode, "Tracking mode", [
    "phone_only",
    "provider_portal",
    "provider_dispatch_feed",
  ]);
  const dispatchIntegration =
    trackingMode === "phone_only"
      ? null
      : text(body.dispatchIntegration, "Dispatch integration name", { min: 2, max: 160 });

  const updated = await query(
    `update ambulance_providers
        set tracking_mode = $2, dispatch_integration = $3
      where id = $1
      returning *`,
    [providerId, trackingMode, dispatchIntegration],
  );

  if (updated.rowCount === 0) {
    throw new HttpError(404, "No ambulance operator with that id.", "NOT_FOUND");
  }

  await recordAudit(null, {
    actor,
    action: "ambulance_tracking_updated",
    entity: "ambulance_providers",
    entityId: updated.rows[0].public_ref,
    detail: { trackingMode, dispatchIntegration },
  });

  return {
    provider: { ...serialiseProvider(updated.rows[0], []), status: updated.rows[0].status },
  };
}

async function adminBookings(params) {
  const status = oneOf(params.get("status"), "Booking status", AMBULANCE_BOOKING_STATUSES, {
    required: false,
  });
  const limit = limitFrom(params.get("limit"), 50, 200);
  const values = [];
  let where = "";
  if (status) {
    values.push(status);
    where = `where b.status = $${values.length}`;
  }
  values.push(limit);

  const result = await query(
    `select b.*, p.public_ref as provider_ref, p.name as provider_name,
            coalesce(p.emergency_hotline, p.contact_phone) as provider_phone
       from ambulance_bookings b
       left join ambulance_providers p on p.id = b.provider_id
       ${where}
      order by b.created_at desc
      limit $${values.length}`,
    values,
  );

  return { bookings: result.rows.map(serialiseBooking) };
}

async function adminAdvanceBooking(body, actor) {
  const reference = text(body.reference, "Booking reference", { min: 4, max: 40 }).toUpperCase();
  const status = oneOf(body.status, "Booking status", AMBULANCE_BOOKING_STATUSES);
  const source = oneOf(body.source, "Status source", BOOKING_EVENT_SOURCES);
  const note = text(body.note, "Status note", { min: 4, max: 500 });

  if (PROVIDER_ATTESTED_STATUSES.includes(status) && source === "medipal") {
    throw new HttpError(
      400,
      `MEDIPAL cannot mark a booking "${status.replace(/_/g, " ")}" by itself. Record how the operator confirmed it — a dispatch feed, or an operator telephone call.`,
      "PROVIDER_CONFIRMATION_REQUIRED",
    );
  }

  return withTransaction(async (client) => {
    const current = await client.query(
      `select * from ambulance_bookings where public_ref = $1 for update`,
      [reference],
    );
    if (current.rowCount === 0) {
      throw new HttpError(404, "No booking with that reference.", "NOT_FOUND");
    }
    const booking = current.rows[0];
    const allowed = ALLOWED_BOOKING_TRANSITIONS[booking.status] ?? [];
    if (!allowed.includes(status)) {
      throw new HttpError(
        409,
        `A booking that is "${booking.status.replace(/_/g, " ")}" cannot move to "${status.replace(/_/g, " ")}". Allowed from here: ${allowed.length ? allowed.join(", ") : "nothing"}.`,
        "INVALID_TRANSITION",
      );
    }

    const updated = await client.query(
      `update ambulance_bookings
          set status = $2,
              status_updated_at = now(),
              cancelled_at = case when $2 = 'cancelled' then now() else cancelled_at end,
              cancelled_reason = case when $2 = 'cancelled' then coalesce(cancelled_reason, $4) else cancelled_reason end
        where id = $1
        returning *`,
      [booking.id, status, null, note],
    );

    await appendEvent(client, {
      bookingId: booking.id,
      status,
      actor,
      source,
      note,
    });

    await recordAudit(client, {
      actor,
      action: "ambulance_booking_status_changed",
      entity: "ambulance_bookings",
      entityId: booking.public_ref,
      detail: { from: booking.status, to: status, source },
    });

    return {
      booking: serialiseBooking(updated.rows[0]),
      events: await bookingEvents(booking.id),
    };
  });
}

async function adminStats() {
  const result = await query(
    `select
       (select count(*)::int from ambulance_providers)                              as providers_total,
       (select count(*)::int from ambulance_providers where status = 'approved')     as providers_approved,
       (select count(*)::int from ambulance_providers where status in ('pending','under_review')) as providers_pending,
       (select count(*)::int from ambulance_provider_services where availability = 'available')    as coverage_available,
       (select count(*)::int from ambulance_bookings)                               as bookings_total,
       (select count(*)::int from ambulance_bookings where status = 'requested')     as bookings_awaiting,
       (select count(*)::int from ambulance_bookings where status in ('dispatched','en_route'))    as bookings_live,
       (select count(*)::int from ambulance_bookings where status = 'completed')     as bookings_completed,
       (select count(*)::int from ambulance_bookings where status = 'cancelled')     as bookings_cancelled,
       (select count(*)::int from ambulance_providers where tracking_mode <> 'phone_only')         as providers_with_live_tracking`,
  );
  return { stats: result.rows[0], generatedAt: new Date().toISOString() };
}

async function adminAuditLog(params) {
  const limit = limitFrom(params.get("limit"), 50, 500);
  const result = await query(
    `select id, actor, action, entity, entity_id, detail, created_at
       from ambulance_audit_logs
      order by created_at desc
      limit $1`,
    [limit],
  );
  return {
    entries: result.rows.map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      detail: row.detail,
      createdAt: row.created_at,
    })),
  };
}

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

export async function handleAmbulanceRoute(request, response, url) {
  const { pathname } = url;
  const method = request.method;

  // ---- public --------------------------------------------------------------
  if (method === "GET" && pathname === "/api/ambulance/info") {
    requireDatabase();
    const providers = await query(
      `select count(*)::int as total,
              count(*) filter (where tracking_mode <> 'phone_only')::int as with_live_tracking
         from ambulance_public_providers`,
    );
    sendJson(response, 200, {
      categories: AMBULANCE_CATEGORIES,
      urgencies: AMBULANCE_URGENCIES,
      needs: AMBULANCE_NEEDS,
      availabilityStates: AMBULANCE_AVAILABILITY,
      bookingStatuses: AMBULANCE_BOOKING_STATUSES,
      coverage: await coverageSummary(),
      sources: await listSources(),
      approvedProviders: providers.rows[0].total,
      providersWithLiveTracking: providers.rows[0].with_live_tracking,
      disclaimer: AMBULANCE_DISCLAIMER,
      emergencyContacts: await listEmergencyContacts(),
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/ambulance/emergency") {
    requireDatabase();
    sendJson(response, 200, {
      contacts: await listEmergencyContacts(),
      disclaimer: AMBULANCE_DISCLAIMER,
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/ambulance/coverage") {
    requireDatabase();
    sendJson(response, 200, { coverage: await coverageDetail(url.searchParams) });
    return true;
  }

  if (method === "GET" && pathname === "/api/ambulance/providers") {
    requireDatabase();
    sendJson(response, 200, await listPublicProviders(url.searchParams));
    return true;
  }

  if (method === "POST" && pathname === "/api/ambulance/bookings") {
    requireDatabase();
    enforceRateLimit(`ambulance-booking:${request.socket.remoteAddress || "unknown"}`, { max: 8 });
    const body = await readJsonBody(request);
    const result = await createBooking(body);
    sendJson(response, result.duplicate ? 200 : 201, result);
    return true;
  }

  if (method === "GET" && pathname.startsWith("/api/ambulance/bookings/")) {
    requireDatabase();
    const reference = decodeURIComponent(pathname.slice("/api/ambulance/bookings/".length));
    sendJson(response, 200, await trackBooking(reference, url.searchParams.get("phone") || ""));
    return true;
  }

  if (method === "POST" && pathname.endsWith("/cancel") && pathname.startsWith("/api/ambulance/bookings/")) {
    requireDatabase();
    enforceRateLimit(`ambulance-cancel:${request.socket.remoteAddress || "unknown"}`, { max: 12 });
    const reference = decodeURIComponent(
      pathname.slice("/api/ambulance/bookings/".length, -"/cancel".length),
    );
    const body = await readJsonBody(request);
    sendJson(response, 200, await cancelBooking(reference, body));
    return true;
  }

  // ---- platform admin ------------------------------------------------------
  if (pathname === "/api/ambulance/admin/session") {
    // Deliberately unauthenticated: the console needs to know whether a key is
    // configured before it can offer a login. It leaks only a boolean.
    sendJson(response, 200, {
      configured: Boolean(config.blood.adminKey),
      message: config.blood.adminKey
        ? "Enter the MEDIPAL platform-admin key to manage ambulance operators."
        : "The platform-admin console is not configured on this server. Set BLOOD_ADMIN_KEY in `.env.server`.",
    });
    return true;
  }

  if (pathname.startsWith("/api/ambulance/admin/")) {
    requireDatabase();
    requireAmbulanceAdmin(request);
    const actor = "platform_admin";
    const tail = pathname.slice("/api/ambulance/admin/".length);

    if (method === "GET" && tail === "stats") {
      sendJson(response, 200, await adminStats());
      return true;
    }
    if (method === "GET" && tail === "audit") {
      sendJson(response, 200, await adminAuditLog(url.searchParams));
      return true;
    }
    if (method === "GET" && tail === "providers") {
      sendJson(response, 200, await adminProviders(url.searchParams));
      return true;
    }
    if (method === "POST" && tail === "providers") {
      const body = await readJsonBody(request);
      sendJson(response, 201, await createProvider(body, actor));
      return true;
    }
    if (method === "POST" && tail === "providers/review") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await reviewProvider(body, actor));
      return true;
    }
    if (method === "POST" && tail === "providers/coverage") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await upsertProviderCoverage(body, actor));
      return true;
    }
    if (method === "POST" && tail === "providers/tracking") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await updateProviderTracking(body, actor));
      return true;
    }
    if (method === "GET" && tail === "bookings") {
      sendJson(response, 200, await adminBookings(url.searchParams));
      return true;
    }
    if (method === "POST" && tail === "bookings/status") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await adminAdvanceBooking(body, actor));
      return true;
    }
  }

  return false;
}
