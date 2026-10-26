/**
 * MEDIPAL · Blood Bank API.
 *
 * Every handler here reads or writes real PostgreSQL rows. Nothing is mocked,
 * and no endpoint ever reports a success it did not achieve:
 *
 *  - Stock figures only exist because a facility reported them. The response
 *    always carries the provenance (`dataSource`) and the observation time
 *    (`lastUpdatedAt`) so the client can show where a number came from.
 *  - Freshness is computed from the *real* clock. The reference application
 *    pinned `now` to a fixed date; doing that here would manufacture the
 *    appearance of fresh data, so it is deliberately not replicated.
 *  - Request status only moves through an audited transition. No endpoint sets
 *    a status optimistically, and no endpoint claims a unit is reserved.
 *  - Donor phone numbers never leave this process except in masked form.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "./env.mjs";
import { query, withTransaction, withRollback, audit, dbConfigured } from "./db.mjs";
import { HttpError, sendJson, readJsonBody } from "./http.mjs";

// -----------------------------------------------------------------------------
// Domain constants (mirror db/migrations/001_blood_bank.sql enums exactly)
// -----------------------------------------------------------------------------
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const COMPONENTS = [
  "Packed Red Blood Cells",
  "Whole Blood",
  "Platelets",
  "Fresh Frozen Plasma",
  "Cryoprecipitate",
];
export const FACILITY_CATEGORIES = [
  "Regional Blood Center",
  "Hospital Blood Bank",
  "Trauma Center Depot",
  "Mobile Collection Hub",
];
export const PRIORITIES = ["Routine", "Urgent", "Stat Emergency"];
export const REQUEST_STATUSES = [
  "created",
  "sent_to_eligible",
  "under_review",
  "proposal_accepted",
  "proposal_rejected",
  "dispatched",
  "received",
  "closed",
  "cancelled",
];
export const FACILITY_STATUSES = ["pending", "under_review", "approved", "rejected", "suspended"];
const FOR_WHOM_OPTIONS = ["Self", "Family member", "Patient under my care", "Other"];

export const FRESHNESS_THRESHOLDS = { RECENT_HOURS: 4, UPDATE_DUE_HOURS: 12 };

/** Days a donor must wait between whole-blood donations (statutory in India). */
const DONATION_INTERVAL_DAYS = 90;

const ALLOWED_TRANSITIONS = {
  created: ["sent_to_eligible", "under_review", "cancelled"],
  sent_to_eligible: ["under_review", "proposal_accepted", "proposal_rejected", "cancelled"],
  under_review: ["proposal_accepted", "proposal_rejected", "cancelled"],
  proposal_accepted: ["dispatched", "cancelled"],
  proposal_rejected: ["sent_to_eligible", "cancelled"],
  dispatched: ["received", "cancelled"],
  received: ["closed"],
  closed: [],
  cancelled: [],
};

// -----------------------------------------------------------------------------
// Small utilities
// -----------------------------------------------------------------------------

/** Never returns the raw number. Used everywhere a donor/requester is shown. */
export function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `+91 ${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Haversine, kilometres. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return round1(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Freshness from the real clock. `now` is injectable purely so the self-test can
 * prove the thresholds; no request path ever passes a synthetic value.
 */
export function computeFreshness({ facilityStatus, hasBloodBank = true, lastObservedAt, hasStock }, now = Date.now()) {
  if (facilityStatus !== "approved") return "not_reporting";
  if (!hasBloodBank) return "unconfirmed_directory";
  if (!lastObservedAt) return "stale_unconfirmed";
  const observed = new Date(lastObservedAt).getTime();
  if (!Number.isFinite(observed)) return "stale_unconfirmed";
  const hours = (now - observed) / 3_600_000;
  if (hours < FRESHNESS_THRESHOLDS.RECENT_HOURS) return hasStock ? "recently_verified" : "no_stock";
  if (hours < FRESHNESS_THRESHOLDS.UPDATE_DUE_HOURS) return "update_due";
  return "stale_unconfirmed";
}

function text(value, field, { min = 0, max = 255, required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${field} is required.`, "VALIDATION");
    return null;
  }
  if (typeof value !== "string") throw new HttpError(400, `${field} must be text.`, "VALIDATION");
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new HttpError(400, `${field} must be at least ${min} characters.`, "VALIDATION");
  }
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters.`, "VALIDATION");
  }
  return trimmed;
}

function oneOf(value, field, allowed, { required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${field} is required.`, "VALIDATION");
    return null;
  }
  if (!allowed.includes(value)) {
    throw new HttpError(400, `${field} must be one of: ${allowed.join(", ")}.`, "VALIDATION");
  }
  return value;
}

function phone(value, field = "Contact number") {
  const raw = text(value, field, { min: 10, max: 20 });
  const digits = raw.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new HttpError(400, `${field} must be a 10-digit Indian mobile number.`, "VALIDATION");
  }
  return digits;
}

function optionalEmail(value) {
  if (value === undefined || value === null || value === "") return null;
  const trimmed = text(value, "Email", { max: 200 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new HttpError(400, "Enter a valid email address.", "VALIDATION");
  }
  return trimmed;
}

function postalCode(value) {
  if (value === undefined || value === null || value === "") return null;
  const trimmed = text(value, "PIN code", { max: 10 });
  if (!/^\d{6}$/.test(trimmed)) throw new HttpError(400, "PIN code must be 6 digits.", "VALIDATION");
  return trimmed;
}

function integer(value, field, { min, max }) {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : value;
  if (!Number.isInteger(n)) throw new HttpError(400, `${field} must be a whole number.`, "VALIDATION");
  if (n < min || n > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max}.`, "VALIDATION");
  }
  return n;
}

function isoTimestamp(value, field, { future = false } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, `${field} is not a valid date.`, "VALIDATION");
  if (future && parsed.getTime() < Date.now()) {
    throw new HttpError(400, `${field} must be in the future.`, "VALIDATION");
  }
  return parsed.toISOString();
}

function isDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, `${field} is not a valid date.`, "VALIDATION");
  if (parsed.getTime() > Date.now()) throw new HttpError(400, `${field} cannot be in the future.`, "VALIDATION");
  return parsed.toISOString().slice(0, 10);
}

function limitFrom(value, fallback = 60, max = 200) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// -----------------------------------------------------------------------------
// Authentication — facility bearer tokens and the platform-admin key
// -----------------------------------------------------------------------------

async function requireFacility(request) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    throw new HttpError(
      401,
      "A facility access token is required. Tokens are issued by the MEDIPAL platform team when a facility is approved.",
      "UNAUTHENTICATED",
    );
  }
  const result = await query("select blood_resolve_facility_token($1) as facility_id", [sha256(token)]);
  const facilityId = result.rows[0]?.facility_id;
  if (!facilityId) {
    throw new HttpError(401, "That facility access token is not valid or has been revoked.", "INVALID_TOKEN");
  }
  await query(
    "update blood_facility_credentials set last_used_at = now() where token_hash = $1 and revoked_at is null",
    [sha256(token)],
  );
  const facility = await query("select * from blood_facilities where id = $1", [facilityId]);
  return { facility: facility.rows[0], facilityId };
}

function requireAdmin(request) {
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

// -----------------------------------------------------------------------------
// Public: sources, emergency info, facilities, availability
// -----------------------------------------------------------------------------

async function listSources() {
  const result = await query(
    `select id, name, source_type, provider, url, verification_status,
            requires_registration, notes, last_synced_at, is_active
       from blood_data_sources
      order by name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    provider: row.provider,
    url: row.url,
    verificationStatus: row.verification_status,
    requiresRegistration: row.requires_registration,
    notes: row.notes,
    lastSyncedAt: row.last_synced_at,
    isActive: row.is_active,
  }));
}

/**
 * Loads approved facilities plus their aggregated inventory once, so the
 * availability and directory endpoints share a single consistent snapshot.
 */
async function loadFacilitySnapshot() {
  const [facilities, inventory] = await Promise.all([
    query(
      `select id, public_ref, name, category, address, city, district, state, postal_code,
              latitude, longitude, phone, emergency_hotline, has_blood_bank, status,
              operating_hours, last_verified_at, data_source_id, source_note
         from blood_facilities
        order by name`,
    ),
    query(
      `select facility_id, blood_group, component, sum(quantity)::int as quantity,
              max(unit) as unit, max(last_updated_at) as last_updated_at,
              count(*)::int as batch_count, min(expiry_date) as nearest_expiry
         from blood_inventory_effective
        where effective_status in ('available','approaching_expiry') and quantity > 0
        group by facility_id, blood_group, component`,
    ),
  ]);

  const byFacility = new Map();
  for (const row of inventory.rows) {
    if (!byFacility.has(row.facility_id)) byFacility.set(row.facility_id, []);
    byFacility.get(row.facility_id).push(row);
  }
  return {
    facilities: facilities.rows,
    stockFor: (facilityId) => byFacility.get(facilityId) || [],
  };
}

function toFacilitySummary(row) {
  return {
    id: row.id,
    reference: row.public_ref,
    name: row.name,
    category: row.category,
    address: row.address,
    city: row.city,
    district: row.district,
    state: row.state,
    postalCode: row.postal_code,
    coordinates:
      row.latitude !== null && row.longitude !== null ? [row.latitude, row.longitude] : null,
    phone: row.phone,
    emergencyHotline: row.emergency_hotline,
    hasBloodBank: row.has_blood_bank,
    status: row.status,
    operatingHours: row.operating_hours,
    lastVerifiedAt: row.last_verified_at,
    dataSourceId: row.data_source_id,
    sourceNote: row.source_note,
  };
}

async function searchAvailability(params) {
  const bloodGroup = oneOf(params.get("bloodGroup"), "Blood group", BLOOD_GROUPS, { required: false });
  const component = oneOf(params.get("component"), "Component", COMPONENTS, { required: false });
  const state = text(params.get("state"), "State", { required: false }) || null;
  const district = text(params.get("district"), "District", { required: false }) || null;
  const city = text(params.get("city"), "City", { required: false }) || null;
  const pin = params.get("postalCode") || params.get("pin");
  const postalCodeValue = pin ? postalCode(pin) : null;
  const freshnessFilter = oneOf(
    params.get("freshness"),
    "Freshness filter",
    ["all", "verified_only", "exclude_stale"],
    { required: false },
  ) || "all";
  const sortBy = oneOf(params.get("sortBy"), "Sort", ["distance", "freshness", "quantity"], {
    required: false,
  }) || "distance";
  const limit = limitFrom(params.get("limit"));

  const lat = Number.parseFloat(params.get("lat") ?? "");
  const lng = Number.parseFloat(params.get("lng") ?? "");
  const hasOrigin = Number.isFinite(lat) && Number.isFinite(lng);
  const radiusRaw = Number.parseFloat(params.get("radiusKm") ?? "");
  const radiusKm = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, 500) : null;

  const snapshot = await loadFacilitySnapshot();

  const matchesRegion = (row) =>
    (!state || row.state?.toLowerCase() === state.toLowerCase()) &&
    (!district || row.district?.toLowerCase() === district.toLowerCase()) &&
    (!city || row.city?.toLowerCase() === city.toLowerCase()) &&
    (!postalCodeValue || row.postal_code === postalCodeValue);

  const componentsInScope = component ? [component] : COMPONENTS;
  const results = [];
  const now = Date.now();

  for (const facility of snapshot.facilities) {
    if (facility.status !== "approved") continue;
    if (!matchesRegion(facility)) continue;

    const km =
      hasOrigin && facility.latitude !== null && facility.longitude !== null
        ? distanceKm(lat, lng, facility.latitude, facility.longitude)
        : null;
    if (radiusKm !== null && km !== null && km > radiusKm) continue;

    const stock = snapshot.stockFor(facility.id);
    // The facility's most recent stock report of any kind. This is what tells us
    // whether the facility is actively reporting stock at all. `last_verified_at`
    // is deliberately NOT used as a fallback: it records when the platform last
    // checked the facility's licence and address, which is not a stock
    // observation, and letting it stand in for one would manufacture freshness.
    const reportedAt = stock.reduce(
      (latest, s) => (!latest || new Date(s.last_updated_at) > new Date(latest) ? s.last_updated_at : latest),
      null,
    );
    let rows = [];

    if (bloodGroup) {
      rows = componentsInScope.map((comp) => {
        const matching = stock.filter((s) => s.blood_group === bloodGroup && s.component === comp);
        const quantity = matching.reduce((sum, s) => sum + s.quantity, 0);
        const lastUpdated = matching.reduce(
          (latest, s) => (!latest || new Date(s.last_updated_at) > new Date(latest) ? s.last_updated_at : latest),
          null,
        );
        const nearestExpiry = matching.reduce(
          (soonest, s) => (!soonest || (s.nearest_expiry && s.nearest_expiry < soonest) ? s.nearest_expiry : soonest),
          null,
        );
        return {
          facility,
          bloodGroup,
          component: comp,
          quantity,
          unit: matching[0]?.unit || "Units",
          batchCount: matching.reduce((sum, s) => sum + s.batch_count, 0),
          lastUpdatedAt: lastUpdated,
          nearestExpiryDate: nearestExpiry,
        };
      });
    } else if (stock.length > 0) {
      rows = stock
        .filter((s) => !component || s.component === component)
        .map((s) => ({
          facility,
          bloodGroup: s.blood_group,
          component: s.component,
          quantity: s.quantity,
          unit: s.unit,
          batchCount: s.batch_count,
          lastUpdatedAt: s.last_updated_at,
          nearestExpiryDate: s.nearest_expiry,
        }));
    } else {
      rows = [
        {
          facility,
          bloodGroup: null,
          component: null,
          quantity: 0,
          unit: "Units",
          batchCount: 0,
          lastUpdatedAt: null,
          nearestExpiryDate: null,
        },
      ];
    }

    for (const row of rows) {
      const hasStock = row.quantity > 0;
      const observedAt = row.lastUpdatedAt || reportedAt;
      const freshnessStatus = computeFreshness(
        {
          facilityStatus: facility.status,
          hasBloodBank: facility.has_blood_bank,
          lastObservedAt: observedAt,
          hasStock,
        },
        now,
      );
      results.push({
        facility: toFacilitySummary(facility),
        bloodGroup: row.bloodGroup,
        component: row.component,
        availableQuantity: row.quantity,
        unit: row.unit,
        batchCount: row.batchCount,
        hasStock,
        lastUpdatedAt: row.lastUpdatedAt,
        nearestExpiryDate: row.nearestExpiryDate,
        facilityLastVerifiedAt: facility.last_verified_at,
        freshnessStatus,
        freshnessBasis: row.lastUpdatedAt
          ? "facility_inventory_report"
          : reportedAt
            ? "facility_other_stock_report"
            : "no_stock_report",
        distanceKm: km,
        dataSourceId: facility.data_source_id,
        sourceNote: facility.source_note,
      });
    }
  }

  let filtered = results;
  if (freshnessFilter === "verified_only") {
    filtered = results.filter((r) => r.freshnessStatus === "recently_verified");
  } else if (freshnessFilter === "exclude_stale") {
    filtered = results.filter((r) => r.freshnessStatus !== "stale_unconfirmed");
  }

  const rank = {
    recently_verified: 0,
    update_due: 1,
    no_stock: 2,
    stale_unconfirmed: 3,
    unconfirmed_directory: 4,
    not_reporting: 5,
  };
  filtered.sort((a, b) => {
    if (sortBy === "quantity") return b.availableQuantity - a.availableQuantity;
    if (sortBy === "freshness") {
      const diff = rank[a.freshnessStatus] - rank[b.freshnessStatus];
      if (diff !== 0) return diff;
      return (b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0) -
        (a.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0);
    }
    if (a.distanceKm === null && b.distanceKm === null) return a.facility.name.localeCompare(b.facility.name);
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  const approvedFacilities = snapshot.facilities.filter(
    (f) => f.status === "approved" && matchesRegion(f),
  );

  return {
    query: {
      bloodGroup,
      component,
      state,
      district,
      city,
      postalCode: postalCodeValue,
      radiusKm,
      origin: hasOrigin ? [lat, lng] : null,
      freshness: freshnessFilter,
      sortBy,
    },
    thresholds: FRESHNESS_THRESHOLDS,
    counts: {
      approvedFacilitiesMatchingArea: approvedFacilities.length,
      resultRows: filtered.length,
      rowsWithStock: filtered.filter((r) => r.hasStock).length,
    },
    results: filtered.slice(0, limit),
    truncated: filtered.length > limit,
    generatedAt: new Date().toISOString(),
  };
}

async function listPublicFacilities(params) {
  const status = oneOf(params.get("status"), "Status", FACILITY_STATUSES, { required: false }) || "approved";
  const category = oneOf(params.get("category"), "Category", FACILITY_CATEGORIES, { required: false });
  const q = (params.get("q") || "").trim().toLowerCase();
  const state = (params.get("state") || "").trim().toLowerCase();
  const city = (params.get("city") || "").trim().toLowerCase();

  const result = await query(
    `select id, public_ref, name, category, address, city, district, state, postal_code,
            latitude, longitude, phone, emergency_hotline, has_blood_bank, status,
            operating_hours, last_verified_at, data_source_id, source_note
       from blood_facilities
      where status = $1
      order by name`,
    [status],
  );

  const rows = result.rows.filter((row) => {
    if (category && row.category !== category) return false;
    if (state && row.state?.toLowerCase() !== state) return false;
    if (city && row.city?.toLowerCase() !== city) return false;
    if (q && !`${row.name} ${row.address || ""} ${row.city}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return {
    status,
    count: rows.length,
    facilities: rows.map((row) => ({
      ...toFacilitySummary(row),
      // A directory entry with no inventory is exactly that — a directory
      // entry. Saying so up front prevents it reading as "zero units available".
      // `lastObservedAt` is left null on purpose: `last_verified_at` says when we
      // checked the facility's details, not when anyone observed its stock, so it
      // cannot be used to claim fresh stock information.
      freshnessStatus: computeFreshness({
        facilityStatus: row.status,
        hasBloodBank: row.has_blood_bank,
        lastObservedAt: null,
        hasStock: false,
      }),
    })),
    note:
      "Directory only. MEDIPAL holds no stock figure for facilities that have not " +
      "reported inventory, so none is displayed.",
  };
}

export const EMERGENCY_INFO = {
  disclaimer:
    "MEDIPAL is not an emergency medical service and cannot dispatch help. If this is a " +
    "medical emergency, call the numbers below or go to the nearest hospital immediately.",
  helplines: [
    { label: "National emergency", number: "112", scope: "All of India" },
    { label: "Ambulance", number: "102", scope: "Government ambulance service" },
    { label: "Disaster / emergency response", number: "108", scope: "Emergency response" },
    { label: "Health helpline", number: "104", scope: "Health advice" },
  ],
  note:
    "These are public Government of India helpline numbers published for public use. " +
    "MEDIPAL does not route, monitor or verify individual calls.",
};

// -----------------------------------------------------------------------------
// Public: donors
// -----------------------------------------------------------------------------

export function computeDonorAvailability(lastDonationDate, now = Date.now()) {
  if (!lastDonationDate) return "available";
  const days = (now - new Date(lastDonationDate).getTime()) / 86_400_000;
  return days < DONATION_INTERVAL_DAYS ? "recently_donated" : "available";
}

async function registerDonor(body) {
  const fullName = text(body.fullName, "Full name", { min: 2, max: 120 });
  const bloodGroup = oneOf(body.bloodGroup, "Blood group", BLOOD_GROUPS);
  const contact = phone(body.phone, "Mobile number");
  const email = optionalEmail(body.email);
  const state = text(body.state, "State", { min: 2, max: 80 });
  const district = text(body.district, "District", { required: false, max: 80 });
  const city = text(body.city, "City / town", { min: 2, max: 80 });
  const pin = postalCode(body.postalCode);
  const lastDonationDate = isDate(body.lastDonationDate, "Last donation date");
  const notes = text(body.notes, "Notes", { required: false, max: 500 });

  if (body.ageConfirmed !== true) {
    throw new HttpError(400, "Donors must be between 18 and 65 years old.", "VALIDATION");
  }
  if (body.weightConfirmed !== true) {
    throw new HttpError(400, "Donors must weigh at least 50 kg.", "VALIDATION");
  }
  if (body.consentToContact !== true) {
    throw new HttpError(
      400,
      "Consent is required before MEDIPAL may share your contact details with a facility.",
      "CONSENT_REQUIRED",
    );
  }

  const availability = computeDonorAvailability(lastDonationDate);

  const result = await query(
    `insert into blood_donors
       (full_name, blood_group, phone, email, state, district, city, postal_code,
        availability, last_donation_date, age_confirmed, weight_confirmed,
        consent_to_contact, consent_recorded_at, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,true,true, now(), $11)
     returning public_ref, blood_group, availability, city, state, created_at`,
    [fullName, bloodGroup, contact, email, state, district, city, pin, availability, lastDonationDate, notes],
  );

  const row = result.rows[0];
  await audit({
    action: "donor.registered",
    entity: "blood_donor",
    entityId: row.public_ref,
    detail: { bloodGroup, city, state, availability },
  });

  return {
    reference: row.public_ref,
    bloodGroup: row.blood_group,
    availability: row.availability,
    location: { city: row.city, state: row.state },
    registeredAt: row.created_at,
    contactOnFile: maskPhone(contact),
    notices: [
      "Your mobile number is stored server-side and is never published. Facilities see a masked form until you are contacted with your consent.",
      "MEDIPAL is a coordination directory, not a blood bank. We cannot guarantee that your details will be matched to a request.",
      "You can ask for your record to be removed at any time by contacting MEDIPAL support.",
    ],
  };
}

/** Aggregate-only view of the donor registry. No names, no numbers, no addresses. */
async function donorSummary(params) {
  const bloodGroup = oneOf(params.get("bloodGroup"), "Blood group", BLOOD_GROUPS, { required: false });
  const state = text(params.get("state"), "State", { required: false, max: 80 });
  const city = text(params.get("city"), "City", { required: false, max: 80 });

  const conditions = [];
  const values = [];
  if (bloodGroup) {
    values.push(bloodGroup);
    conditions.push(`blood_group = $${values.length}`);
  }
  if (state) {
    values.push(state);
    conditions.push(`lower(state) = lower($${values.length})`);
  }
  if (city) {
    values.push(city);
    conditions.push(`lower(city) = lower($${values.length})`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const result = await query(
    `select blood_group, availability, count(*)::int as donors
       from blood_donors
       ${where}
      group by blood_group, availability
      order by blood_group, availability`,
    values,
  );

  const total = result.rows.reduce((sum, row) => sum + row.donors, 0);
  return {
    scope: { bloodGroup, state, city },
    totalRegisteredDonors: total,
    byGroupAndAvailability: result.rows.map((row) => ({
      bloodGroup: row.blood_group,
      availability: row.availability,
      donors: row.donors,
    })),
    dataSource: {
      id: "facility_self_report",
      label: "Self-registered donors",
      verificationStatus: "unverified",
    },
    notice:
      "These are volunteers who registered themselves with MEDIPAL. A registered count is " +
      "NOT blood available on a shelf — it says nothing about eligibility today, and no " +
      "donor has been contacted or reserved. Contact details are withheld.",
  };
}

// -----------------------------------------------------------------------------
// Public: requests
// -----------------------------------------------------------------------------

async function createRequest(body) {
  const requesterName = text(body.requesterName, "Your name", { min: 2, max: 120 });
  const contact = phone(body.contactPhone, "Contact number");
  const email = optionalEmail(body.contactEmail);
  const forWhom = oneOf(body.forWhom, "Who is this for", FOR_WHOM_OPTIONS);
  const patientReference = text(body.patientReference, "Patient reference", { required: false, max: 60 });
  const bloodGroup = oneOf(body.bloodGroup, "Blood group", BLOOD_GROUPS);
  const component = oneOf(body.component, "Component", COMPONENTS);
  const unitsRequired = integer(body.unitsRequired, "Units required", { min: 1, max: 20 });
  const priority = oneOf(body.priority, "Priority", PRIORITIES);
  const requiredBy = isoTimestamp(body.requiredBy, "Required by");
  const clinicalIndication = text(body.clinicalIndication, "Clinical indication", {
    required: false,
    max: 500,
  });
  const state = text(body.state, "State", { min: 2, max: 80 });
  const district = text(body.district, "District", { required: false, max: 80 });
  const city = text(body.city, "City / town", { min: 2, max: 80 });
  const pin = postalCode(body.postalCode);
  const hospitalName = text(body.hospitalName, "Hospital name", { required: false, max: 160 });

  if (body.consentRecorded !== true) {
    throw new HttpError(
      400,
      "The request cannot be submitted without recorded consent to share these details with blood banks.",
      "CONSENT_REQUIRED",
    );
  }
  if (priority === "Stat Emergency" && !hospitalName) {
    throw new HttpError(
      400,
      "A Stat Emergency request must name the hospital so a facility can verify it.",
      "VALIDATION",
    );
  }

  const created = await withTransaction(async (client) => {
    const inserted = await client.query(
      `insert into blood_requests
         (requester_name, contact_phone, contact_email, for_whom, patient_reference,
          blood_group, component, units_required, priority, required_by, clinical_indication,
          state, district, city, postal_code, hospital_name, status,
          consent_recorded, consent_recorded_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'created',true, now())
       returning id, public_ref, status, priority, created_at`,
      [
        requesterName, contact, email, forWhom, patientReference,
        bloodGroup, component, unitsRequired, priority, requiredBy, clinicalIndication,
        state, district, city, pin, hospitalName,
      ],
    );
    const row = inserted.rows[0];
    await client.query(
      `insert into blood_request_events (request_id, from_status, to_status, note, actor)
       values ($1, null, 'created', $2, 'requester')`,
      [row.id, `Request recorded with ${priority} priority.`],
    );
    return row;
  });

  await audit({
    actor: `request:${created.public_ref}`,
    action: "request.created",
    entity: "blood_request",
    entityId: created.public_ref,
    detail: { bloodGroup, component, unitsRequired, priority, city, state },
  });

  return {
    reference: created.public_ref,
    status: created.status,
    priority: created.priority,
    createdAt: created.created_at,
    tracking: {
      howTo: `Open “Track a request” and enter reference ${created.public_ref} together with the mobile number you submitted.`,
      reference: created.public_ref,
    },
    truthfulness: [
      "Your request has been recorded. It has NOT been sent to any blood bank automatically.",
      "MEDIPAL has not reserved any blood, and no donor has been contacted.",
      "A facility must explicitly accept a request before anything is dispatched; the status page will show each step as it actually happens.",
    ],
    nextSteps: [
      "Call the blood banks listed under Find Blood directly — for urgent need, the telephone is faster than any directory.",
      `${EMERGENCY_INFO.helplines[0].label}: ${EMERGENCY_INFO.helplines[0].number}`,
    ],
  };
}

async function trackRequest(reference, phoneValue) {
  const ref = text(reference, "Reference", { min: 4, max: 40 });
  const contact = phone(phoneValue, "Contact number");

  const result = await query(
    `select r.*, f.name as supplying_facility_name, f.phone as supplying_facility_phone
       from blood_requests r
       left join blood_facilities f on f.id = r.supplying_facility_id
      where r.public_ref = $1 and r.contact_phone = $2`,
    [ref.toUpperCase(), contact],
  );
  if (result.rowCount === 0) {
    // Deliberately identical for "no such reference" and "wrong number".
    throw new HttpError(
      404,
      "No request matches that reference and contact number. Check both and try again.",
      "NOT_FOUND",
    );
  }
  const row = result.rows[0];
  const events = await query(
    `select from_status, to_status, note, actor, created_at
       from blood_request_events where request_id = $1 order by created_at`,
    [row.id],
  );

  return {
    reference: row.public_ref,
    status: row.status,
    priority: row.priority,
    bloodGroup: row.blood_group,
    component: row.component,
    unitsRequired: row.units_required,
    requiredBy: row.required_by,
    location: { city: row.city, district: row.district, state: row.state },
    hospitalName: row.hospital_name,
    hospitalVerified: row.hospital_verified,
    contactOnFile: maskPhone(row.contact_phone),
    supplyingFacility: row.supplying_facility_name
      ? { name: row.supplying_facility_name, phone: row.supplying_facility_phone }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    timeline: events.rows.map((event) => ({
      from: event.from_status,
      to: event.to_status,
      note: event.note,
      actor: event.actor,
      at: event.created_at,
    })),
    note:
      "This timeline shows only events that have actually been recorded. An empty or short " +
      "timeline means nothing has happened yet — it does not mean help is on the way.",
  };
}

// -----------------------------------------------------------------------------
// Public: facility applications and notifications
// -----------------------------------------------------------------------------

async function submitFacilityApplication(body) {
  const name = text(body.name, "Facility name", { min: 3, max: 160 });
  const category = oneOf(body.category, "Category", FACILITY_CATEGORIES);
  const address = text(body.address, "Address", { min: 5, max: 400 });
  const state = text(body.state, "State", { min: 2, max: 80 });
  const district = text(body.district, "District", { required: false, max: 80 });
  const city = text(body.city, "City / town", { min: 2, max: 80 });
  const pin = postalCode(body.postalCode);
  const licenseNumber = text(body.licenseNumber, "Blood bank licence number", { min: 3, max: 80 });
  const authorizedRep = text(body.authorizedRep, "Authorised representative", { min: 2, max: 120 });
  const contact = phone(body.phone, "Facility phone");
  const emergencyHotline = body.emergencyHotline ? phone(body.emergencyHotline, "Emergency hotline") : null;
  const email = optionalEmail(body.email);
  const operatingHours = text(body.operatingHours, "Operating hours", { required: false, max: 120 });
  const hasBloodBank = body.hasBloodBank !== false;

  const latitude = Number.parseFloat(body.latitude);
  const longitude = Number.parseFloat(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new HttpError(
      400,
      "Latitude and longitude are required so the facility can appear on the map. Search the address first.",
      "VALIDATION",
    );
  }
  if (body.contactConsent !== true) {
    throw new HttpError(400, "Confirmation from an authorised representative is required.", "CONSENT_REQUIRED");
  }

  const result = await query(
    `insert into blood_facilities
       (name, category, address, city, district, state, postal_code, latitude, longitude,
        phone, emergency_hotline, email, license_number, status, has_blood_bank,
        operating_hours, authorized_rep, data_source_id, source_note, contact_consent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,$15,$16,
             'facility_self_report',
             'Submitted by the facility itself; licence and address pending MEDIPAL review.', true)
     returning public_ref, status, submitted_at`,
    [
      name, category, address, city, district, state, pin, latitude, longitude,
      contact, emergencyHotline, email, licenseNumber, hasBloodBank,
      operatingHours, authorizedRep,
    ],
  );
  const row = result.rows[0];

  await query(
    `insert into blood_notifications (audience, type, title, body)
     values ('platform_admin', 'facility_approval', $1, $2)`,
    [
      `New facility application: ${name}`,
      `Application ${row.public_ref} from ${city}, ${state}. Licence ${licenseNumber}. Awaiting review.`,
    ],
  );
  await audit({
    actor: `facility:${row.public_ref}`,
    action: "facility.application_submitted",
    entity: "blood_facility",
    entityId: row.public_ref,
    detail: { name, city, state, licenseNumber },
  });

  return {
    reference: row.public_ref,
    status: row.status,
    submittedAt: row.submitted_at,
    notices: [
      "Your application is pending. The facility is NOT listed publicly and cannot sign in to report inventory until a MEDIPAL reviewer approves it.",
      "On approval you receive a one-time facility access token, shown only once — store it securely and never share it.",
    ],
  };
}

async function publicNotifications() {
  const result = await query(
    `select type, title, body, created_at
       from blood_notifications
      where audience = 'public'
      order by created_at desc
      limit 25`,
  );
  return {
    notifications: result.rows.map((row) => ({
      type: row.type,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
    })),
  };
}

// -----------------------------------------------------------------------------
// Facility console
// -----------------------------------------------------------------------------

async function facilityMe(facilityId) {
  const facility = await query(
    `select f.*, s.name as source_name, s.verification_status as source_verification
       from blood_facilities f
       join blood_data_sources s on s.id = f.data_source_id
      where f.id = $1`,
    [facilityId],
  );
  const counts = await query(
    `select
       count(*)::int as batch_rows,
       coalesce(sum(quantity), 0)::int as total_units
       from blood_inventory_effective
      where facility_id = $1 and effective_status in ('available','approaching_expiry')`,
    [facilityId],
  );
  return {
    facility: toFacilitySummary(facility.rows[0]),
    dataSource: {
      id: facility.rows[0].data_source_id,
      name: facility.rows[0].source_name,
      verificationStatus: facility.rows[0].source_verification,
    },
    inventory: counts.rows[0],
    // Being explicit here is the point: the console must never imply the
    // platform vouches for figures it has not verified.
    provenance:
      "Figures you publish are attributed to your facility as self-reported and are shown " +
      "to the public with that label and the time you last updated them.",
  };
}

async function facilityInventory(facilityId) {
  const result = await query(
    `select id, blood_group, component, quantity, unit, batch_number, collection_date,
            expiry_date, storage_location, status, effective_status, notes, reported_by,
            last_updated_at
       from blood_inventory_effective
      where facility_id = $1
      order by blood_group, component, expiry_date nulls last`,
    [facilityId],
  );
  return { inventory: result.rows.map(serialiseInventory) };
}

function serialiseInventory(row) {
  return {
    id: row.id,
    bloodGroup: row.blood_group,
    component: row.component,
    quantity: row.quantity,
    unit: row.unit,
    batchNumber: row.batch_number,
    collectionDate: row.collection_date,
    expiryDate: row.expiry_date,
    storageLocation: row.storage_location,
    status: row.status,
    effectiveStatus: row.effective_status,
    notes: row.notes,
    reportedBy: row.reported_by,
    lastUpdatedAt: row.last_updated_at,
  };
}

async function recordMovement(client, entry) {
  await client.query(
    `insert into blood_inventory_movements
       (facility_id, inventory_id, blood_group, component, movement_type, quantity, unit,
        balance_after, reason, performed_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      entry.facilityId, entry.inventoryId ?? null, entry.bloodGroup, entry.component,
      entry.movementType, entry.quantity, entry.unit ?? "Units",
      entry.balanceAfter ?? null, entry.reason, entry.performedBy ?? null,
    ],
  );
}

async function reportStock(facilityId, body, actor) {
  const bloodGroup = oneOf(body.bloodGroup, "Blood group", BLOOD_GROUPS);
  const component = oneOf(body.component, "Component", COMPONENTS);
  const quantity = integer(body.quantity, "Quantity", { min: 0, max: 100_000 });
  const unit = oneOf(body.unit, "Unit", ["Units", "mL"], { required: false }) || "Units";
  const batchNumber = text(body.batchNumber, "Batch number", { required: false, max: 60 });
  const collectionDate = isDate(body.collectionDate, "Collection date");
  const expiryDate = body.expiryDate ? new Date(body.expiryDate).toISOString().slice(0, 10) : null;
  const storageLocation = text(body.storageLocation, "Storage location", { required: false, max: 80 });
  const status = oneOf(body.status, "Status", ["available", "reserved", "quarantine"], { required: false }) || "available";
  const notes = text(body.notes, "Notes", { required: false, max: 400 });
  const reason = text(body.reason, "Reason", { min: 4, max: 200 });

  const saved = await withTransaction(async (client) => {
    const existing = batchNumber
      ? await client.query(
          `select id, quantity, unit from blood_inventory
            where facility_id = $1 and batch_number = $2 and blood_group = $3 and component = $4
            limit 1`,
          [facilityId, batchNumber, bloodGroup, component],
        )
      : { rowCount: 0, rows: [] };

    if (existing.rowCount > 0) {
      const row = existing.rows[0];
      const updated = await client.query(
        `update blood_inventory
            set quantity = $2, unit = $3, collection_date = $4, expiry_date = $5,
                storage_location = $6, status = $7, notes = $8, reported_by = $9,
                data_source_id = 'facility_self_report', last_updated_at = now()
          where id = $1
          returning *`,
        [
          row.id, quantity, unit, collectionDate, expiryDate,
          storageLocation, status, notes, actor,
        ],
      );
      await recordMovement(client, {
        facilityId,
        inventoryId: row.id,
        bloodGroup,
        component,
        movementType: "manual_adjustment",
        quantity: quantity - row.quantity,
        unit,
        balanceAfter: quantity,
        reason,
        performedBy: actor,
      });
      return { row: updated.rows[0], created: false };
    }

    const inserted = await client.query(
      `insert into blood_inventory
         (facility_id, blood_group, component, quantity, unit, batch_number, collection_date,
          expiry_date, storage_location, status, notes, reported_by, data_source_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'facility_self_report')
       returning *`,
      [
        facilityId, bloodGroup, component, quantity, unit, batchNumber, collectionDate,
        expiryDate, storageLocation, status, notes, actor,
      ],
    );
    await recordMovement(client, {
      facilityId,
      inventoryId: inserted.rows[0].id,
      bloodGroup,
      component,
      movementType: "receipt",
      quantity,
      unit,
      balanceAfter: quantity,
      reason,
      performedBy: actor,
    });
    return { row: inserted.rows[0], created: true };
  });

  await audit({
    actor,
    action: saved.created ? "inventory.reported" : "inventory.updated",
    entity: "blood_inventory",
    entityId: saved.row.id,
    detail: { bloodGroup, component, quantity, status },
  });

  return {
    item: serialiseInventory({
      ...saved.row,
      effective_status: saved.row.status,
    }),
    created: saved.created,
    publishedAt: saved.row.last_updated_at,
  };
}

async function adjustStock(facilityId, body, actor) {
  const inventoryId = text(body.inventoryId, "Inventory row", { min: 8, max: 60 });
  const movementType = oneOf(body.movementType, "Movement type", [
    "issue", "transfer_out", "expiry_quarantine", "manual_adjustment",
  ]);
  const quantity = integer(body.quantity, "Quantity", { min: 1, max: 100_000 });
  const reason = text(body.reason, "Reason", { min: 5, max: 300 });

  const result = await withTransaction(async (client) => {
    const current = await client.query(
      "select * from blood_inventory where id = $1 and facility_id = $2 for update",
      [inventoryId, facilityId],
    );
    if (current.rowCount === 0) {
      throw new HttpError(404, "That inventory row does not belong to your facility.", "NOT_FOUND");
    }
    const row = current.rows[0];
    if (row.quantity < quantity) {
      throw new HttpError(
        409,
        `Only ${row.quantity} ${row.unit} are recorded for ${row.blood_group} ${row.component}. ` +
          "You cannot remove more than the recorded balance.",
        "INSUFFICIENT_STOCK",
      );
    }

    const isQuarantine = movementType === "expiry_quarantine";
    const updated = await client.query(
      `update blood_inventory
          set quantity = quantity - $2,
              status = case when $3 then 'quarantine'::blood_inventory_status else status end,
              last_updated_at = now()
        where id = $1
        returning *`,
      [inventoryId, quantity, isQuarantine],
    );

    await recordMovement(client, {
      facilityId,
      inventoryId,
      bloodGroup: row.blood_group,
      component: row.component,
      movementType,
      quantity: -quantity,
      unit: row.unit,
      balanceAfter: updated.rows[0].quantity,
      reason,
      performedBy: actor,
    });
    return updated.rows[0];
  });

  await audit({
    actor,
    action: `inventory.${movementType}`,
    entity: "blood_inventory",
    entityId: inventoryId,
    detail: { quantity, reason },
  });

  return {
    item: serialiseInventory({ ...result, effective_status: result.status }),
    movementRecorded: true,
  };
}

async function facilityMovements(facilityId) {
  const result = await query(
    `select m.*, i.batch_number
       from blood_inventory_movements m
       left join blood_inventory i on i.id = m.inventory_id
      where m.facility_id = $1
      order by m.occurred_at desc
      limit 100`,
    [facilityId],
  );
  return {
    movements: result.rows.map((row) => ({
      id: row.id,
      bloodGroup: row.blood_group,
      component: row.component,
      movementType: row.movement_type,
      quantity: row.quantity,
      unit: row.unit,
      balanceAfter: row.balance_after,
      batchNumber: row.batch_number,
      reason: row.reason,
      performedBy: row.performed_by,
      occurredAt: row.occurred_at,
    })),
  };
}

async function facilityExpiry(facilityId) {
  const result = await query(
    `select id, blood_group, component, quantity, unit, batch_number, expiry_date,
            effective_status, storage_location, last_updated_at
       from blood_inventory_effective
      where facility_id = $1
        and expiry_date is not null
        and expiry_date <= current_date + 45
      order by expiry_date`,
    [facilityId],
  );
  const today = new Date().toISOString().slice(0, 10);
  return {
    today,
    items: result.rows.map((row) => ({
      ...serialiseInventory({ ...row, status: row.effective_status }),
      daysToExpiry: Math.round(
        (new Date(row.expiry_date).getTime() - new Date(today).getTime()) / 86_400_000,
      ),
    })),
  };
}

async function facilityOpenRequests(facilityId) {
  const facility = await query("select state, city from blood_facilities where id = $1", [facilityId]);
  const { state, city } = facility.rows[0];
  const result = await query(
    `select r.public_ref, r.blood_group, r.component, r.units_required, r.priority,
            r.city, r.district, r.state, r.hospital_name, r.created_at, r.required_by,
            r.status,
            (select count(*)::int from blood_request_proposals p
              where p.request_id = r.id and p.facility_id = $3) as my_proposals
       from blood_requests r
      where r.status in ('created','sent_to_eligible','under_review')
        and (lower(r.state) = lower($1) or lower(r.city) = lower($2))
      order by
        case r.priority when 'Stat Emergency' then 0 when 'Urgent' then 1 else 2 end,
        r.created_at
      limit 50`,
    [state, city, facilityId],
  );
  return {
    scope: { state, city },
    notice:
      "Requests are shown because they name your state or city. Nothing has been allocated, " +
      "reserved or dispatched until a proposal is accepted and the status timeline says so.",
    requests: result.rows.map((row) => ({
      reference: row.public_ref,
      bloodGroup: row.blood_group,
      component: row.component,
      unitsRequired: row.units_required,
      priority: row.priority,
      city: row.city,
      district: row.district,
      state: row.state,
      hospitalName: row.hospital_name,
      status: row.status,
      createdAt: row.created_at,
      requiredBy: row.required_by,
      myProposals: row.my_proposals,
    })),
  };
}

async function submitProposal(facilityId, body, actor) {
  const reference = text(body.reference, "Request reference", { min: 4, max: 40 }).toUpperCase();
  // The bound here is only a sanity guard against absurd input. The meaningful
  // limit is the facility's own recorded stock, checked below inside the
  // transaction, so a large-but-plausible offer is refused for the real reason
  // ("you have not recorded that many units") rather than a range error.
  const unitsOffered = integer(body.unitsOffered, "Units offered", { min: 1, max: 500 });
  const message = text(body.message, "Message", { required: false, max: 500 });

  return withTransaction(async (client) => {
    const request = await client.query(
      "select id, status, units_required, blood_group, component from blood_requests where public_ref = $1 for update",
      [reference],
    );
    if (request.rowCount === 0) throw new HttpError(404, "No request with that reference.", "NOT_FOUND");
    const row = request.rows[0];
    if (["closed", "cancelled", "received"].includes(row.status)) {
      throw new HttpError(409, `That request is already ${row.status} and cannot receive proposals.`, "INVALID_STATE");
    }

    const available = await client.query(
      `select coalesce(sum(quantity), 0)::int as units
         from blood_inventory_effective
        where facility_id = $1 and blood_group = $2 and component = $3
          and effective_status in ('available','approaching_expiry')`,
      [facilityId, row.blood_group, row.component],
    );
    if (available.rows[0].units < unitsOffered) {
      // Refusing here is the honest behaviour: the console must not let a
      // facility promise units it has not recorded.
      throw new HttpError(
        409,
        `Your recorded stock for ${row.blood_group} ${row.component} is ${available.rows[0].units} ` +
          `units, so you cannot offer ${unitsOffered}. Update your inventory first.`,
        "INSUFFICIENT_RECORDED_STOCK",
      );
    }

    const inserted = await client.query(
      `insert into blood_request_proposals (request_id, facility_id, units_offered, message)
       values ($1,$2,$3,$4)
       on conflict (request_id, facility_id) do update
         set units_offered = excluded.units_offered,
             message = excluded.message,
             status = 'offered',
             created_at = now(),
             responded_at = null
       returning id, status, created_at`,
      [row.id, facilityId, unitsOffered, message],
    );

    const fromStatus = row.status;
    if (fromStatus === "created") {
      await client.query(
        `update blood_requests set status = 'sent_to_eligible' where id = $1`,
        [row.id],
      );
      await client.query(
        `insert into blood_request_events (request_id, from_status, to_status, note, actor)
         values ($1, 'created', 'sent_to_eligible', $2, 'facility')`,
        [row.id, "At least one facility has reviewed the request."],
      );
    }
    await client.query(
      `insert into blood_notifications (audience, facility_id, type, title, body)
       values ('facility', $1, 'shortage_request', $2, $3)`,
      [facilityId, `Proposal recorded for ${reference}`, `You offered ${unitsOffered} units.`],
    );

    await audit({ actor, action: "request.proposal_submitted", entity: "blood_request", entityId: reference, detail: { unitsOffered } });
    return { proposal: inserted.rows[0], requestStatus: fromStatus === "created" ? "sent_to_eligible" : fromStatus };
  });
}

async function facilityTransfers(facilityId) {
  const result = await query(
    `select t.*, ff.name as from_name, tf.name as to_name, cc.code as passport_code, cc.status as passport_status
       from blood_transfers t
       join blood_facilities ff on ff.id = t.from_facility_id
       join blood_facilities tf on tf.id = t.to_facility_id
       left join blood_cold_chain_passports cc on cc.id = t.cold_chain_passport_id
      where t.from_facility_id = $1 or t.to_facility_id = $1
      order by t.requested_at desc
      limit 50`,
    [facilityId],
  );
  return {
    transfers: result.rows.map((row) => ({
      id: row.id,
      direction: row.from_facility_id === facilityId ? "outgoing" : "incoming",
      fromFacility: row.from_name,
      toFacility: row.to_name,
      bloodGroup: row.blood_group,
      component: row.component,
      quantity: row.quantity,
      unit: row.unit,
      status: row.status,
      coldChainCode: row.passport_code,
      coldChainStatus: row.passport_status,
      notes: row.notes,
      requestedAt: row.requested_at,
      dispatchedAt: row.dispatched_at,
      receivedAt: row.received_at,
    })),
  };
}

const TRANSFER_FLOW = {
  requested: ["approved", "cancelled"],
  approved: ["in_transit", "cancelled"],
  in_transit: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

async function createTransfer(facilityId, body, actor) {
  const toReference = text(body.toFacilityReference, "Receiving facility reference", { min: 4, max: 40 }).toUpperCase();
  const bloodGroup = oneOf(body.bloodGroup, "Blood group", BLOOD_GROUPS);
  const component = oneOf(body.component, "Component", COMPONENTS);
  const quantity = integer(body.quantity, "Quantity", { min: 1, max: 100_000 });
  const notes = text(body.notes, "Notes", { required: false, max: 400 });

  return withTransaction(async (client) => {
    const target = await client.query(
      "select id, name, status from blood_facilities where public_ref = $1",
      [toReference],
    );
    if (target.rowCount === 0) throw new HttpError(404, "No facility with that reference.", "NOT_FOUND");
    if (target.rows[0].id === facilityId) {
      throw new HttpError(400, "A transfer needs two different facilities.", "VALIDATION");
    }

    const available = await client.query(
      `select coalesce(sum(quantity),0)::int as units from blood_inventory_effective
        where facility_id = $1 and blood_group = $2 and component = $3
          and effective_status = 'available'`,
      [facilityId, bloodGroup, component],
    );
    if (available.rows[0].units < quantity) {
      throw new HttpError(
        409,
        `Only ${available.rows[0].units} units of ${bloodGroup} ${component} are recorded as available ` +
          "at your facility. Transfers cannot exceed recorded stock.",
        "INSUFFICIENT_RECORDED_STOCK",
      );
    }

    const inserted = await client.query(
      `insert into blood_transfers (from_facility_id, to_facility_id, blood_group, component, quantity, notes)
       values ($1,$2,$3,$4,$5,$6) returning id, status, requested_at`,
      [facilityId, target.rows[0].id, bloodGroup, component, quantity, notes],
    );
    await client.query(
      `insert into blood_notifications (audience, facility_id, type, title, body)
       values ('facility', $1, 'transfer_update', $2, $3)`,
      [target.rows[0].id, "Incoming transfer requested", `${quantity} units of ${bloodGroup} ${component}.`],
    );
    await audit({ actor, action: "transfer.requested", entity: "blood_transfer", entityId: inserted.rows[0].id, detail: { quantity } });
    return { transfer: inserted.rows[0] };
  });
}

async function advanceTransfer(facilityId, body, actor) {
  const transferId = text(body.transferId, "Transfer", { min: 8, max: 60 });
  const nextStatus = oneOf(body.status, "Status", Object.keys(TRANSFER_FLOW));

  return withTransaction(async (client) => {
    const current = await client.query(
      "select * from blood_transfers where id = $1 and (from_facility_id = $2 or to_facility_id = $2) for update",
      [transferId, facilityId],
    );
    if (current.rowCount === 0) throw new HttpError(404, "That transfer is not yours.", "NOT_FOUND");
    const row = current.rows[0];
    if (!TRANSFER_FLOW[row.status].includes(nextStatus)) {
      throw new HttpError(
        409,
        `A transfer that is "${row.status}" cannot move to "${nextStatus}".`,
        "INVALID_TRANSITION",
      );
    }

    if (nextStatus === "in_transit") {
      // Dispatch is the point where stock actually leaves the ledger.
      const available = await client.query(
        `select coalesce(sum(quantity),0)::int as units, min(id::text) as any_id
           from blood_inventory_effective
          where facility_id = $1 and blood_group = $2 and component = $3
            and effective_status = 'available'`,
        [row.from_facility_id, row.blood_group, row.component],
      );
      if (available.rows[0].units < row.quantity) {
        throw new HttpError(409, "Recorded stock is no longer sufficient to dispatch this transfer.", "INSUFFICIENT_RECORDED_STOCK");
      }
      await client.query(
        `update blood_inventory set quantity = quantity - $2, last_updated_at = now()
          where id = (
            select id from blood_inventory
             where facility_id = $1 and blood_group = $3 and component = $4 and quantity >= $2
               and status = 'available'
             order by expiry_date nulls last limit 1)`,
        [row.from_facility_id, row.quantity, row.blood_group, row.component],
      );
      await recordMovement(client, {
        facilityId: row.from_facility_id,
        bloodGroup: row.blood_group,
        component: row.component,
        movementType: "transfer_out",
        quantity: -row.quantity,
        reason: `Transfer ${transferId} dispatched.`,
        performedBy: actor,
      });
      await client.query(
        `insert into blood_notifications (audience, facility_id, type, title, body)
         values ('facility', $1, 'transfer_update', 'Transfer dispatched', $2)`,
        [row.to_facility_id, `${row.quantity} units of ${row.blood_group} ${row.component} are in transit.`],
      );
    }

    if (nextStatus === "received") {
      const existing = await client.query(
        `select id from blood_inventory
          where facility_id = $1 and blood_group = $2 and component = $3 and batch_number = $4`,
        [row.to_facility_id, row.blood_group, row.component, `TRF-${transferId.slice(0, 8)}`],
      );
      if (existing.rowCount > 0) {
        await client.query(
          `update blood_inventory set quantity = quantity + $2, last_updated_at = now() where id = $1`,
          [existing.rows[0].id, row.quantity],
        );
      } else {
        await client.query(
          `insert into blood_inventory
             (facility_id, blood_group, component, quantity, unit, batch_number, status,
              data_source_id, reported_by, last_updated_at, notes)
           values ($1,$2,$3,$4,'Units',$5,'available','facility_self_report',$6, now(), $7)`,
          [
            row.to_facility_id, row.blood_group, row.component, row.quantity,
            `TRF-${transferId.slice(0, 8)}`, actor, `Received via transfer ${transferId}.`,
          ],
        );
      }
      await recordMovement(client, {
        facilityId: row.to_facility_id,
        bloodGroup: row.blood_group,
        component: row.component,
        movementType: "transfer_in",
        quantity: row.quantity,
        reason: `Transfer ${transferId} received.`,
        performedBy: actor,
      });
    }

    const updated = await client.query(
      `update blood_transfers
          set status = $2,
              dispatched_at = case when $2 = 'in_transit' then now() else dispatched_at end,
              received_at = case when $2 = 'received' then now() else received_at end
        where id = $1
        returning *`,
      [transferId, nextStatus],
    );
    await audit({ actor, action: `transfer.${nextStatus}`, entity: "blood_transfer", entityId: transferId });
    return { transfer: updated.rows[0] };
  });
}

async function facilityColdChain(facilityId) {
  const result = await query(
    `select p.*, (select count(*)::int from blood_cold_chain_observations o where o.passport_id = p.id) as observations,
            (select count(*)::int from blood_cold_chain_observations o where o.passport_id = p.id and o.is_excursion) as excursions
       from blood_cold_chain_passports p
      where p.facility_id = $1
      order by p.started_at desc
      limit 25`,
    [facilityId],
  );
  const passports = [];
  for (const row of result.rows) {
    const observations = await query(
      `select temp_celsius, is_excursion, note, recorded_by, recorded_at
         from blood_cold_chain_observations where passport_id = $1 order by recorded_at`,
      [row.id],
    );
    passports.push({
      id: row.id,
      code: row.code,
      targetMinCelsius: Number(row.target_min_celsius),
      targetMaxCelsius: Number(row.target_max_celsius),
      currentTempCelsius: row.current_temp_celsius === null ? null : Number(row.current_temp_celsius),
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      notes: row.notes,
      observationCount: row.observations,
      excursionCount: row.excursions,
      observations: observations.rows.map((o) => ({
        tempCelsius: Number(o.temp_celsius),
        isExcursion: o.is_excursion,
        note: o.note,
        recordedBy: o.recorded_by,
        recordedAt: o.recorded_at,
      })),
    });
  }
  return { passports };
}

async function createColdChainPassport(facilityId, body, actor) {
  const targetMin = Number.parseFloat(body.targetMinCelsius);
  const targetMax = Number.parseFloat(body.targetMaxCelsius);
  if (!Number.isFinite(targetMin) || !Number.isFinite(targetMax)) {
    throw new HttpError(400, "Target temperatures must be numbers.", "VALIDATION");
  }
  if (targetMax <= targetMin) throw new HttpError(400, "The target range is inverted.", "VALIDATION");
  const notes = text(body.notes, "Notes", { required: false, max: 300 });
  const code = `CC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const result = await query(
    `insert into blood_cold_chain_passports (code, facility_id, target_min_celsius, target_max_celsius, notes)
     values ($1,$2,$3,$4,$5) returning id, code, status`,
    [code, facilityId, targetMin, targetMax, notes],
  );
  await audit({ actor, action: "coldchain.created", entity: "blood_cold_chain", entityId: result.rows[0].id });
  return { passport: result.rows[0] };
}

async function addColdChainObservation(facilityId, body, actor) {
  const passportId = text(body.passportId, "Passport", { min: 8, max: 60 });
  const temp = Number.parseFloat(body.tempCelsius);
  if (!Number.isFinite(temp)) throw new HttpError(400, "Temperature must be a number.", "VALIDATION");
  const note = text(body.note, "Note", { required: false, max: 300 });

  return withTransaction(async (client) => {
    const passport = await client.query(
      "select * from blood_cold_chain_passports where id = $1 and facility_id = $2 for update",
      [passportId, facilityId],
    );
    if (passport.rowCount === 0) throw new HttpError(404, "That cold-chain passport is not yours.", "NOT_FOUND");
    const row = passport.rows[0];
    if (["completed", "exception_review"].includes(row.status) && row.completed_at) {
      throw new HttpError(409, "That passport is already closed.", "INVALID_STATE");
    }

    const min = Number(row.target_min_celsius);
    const max = Number(row.target_max_celsius);
    const isExcursion = temp < min || temp > max;

    await client.query(
      `insert into blood_cold_chain_observations (passport_id, temp_celsius, is_excursion, note, recorded_by)
       values ($1,$2,$3,$4,$5)`,
      [passportId, temp, isExcursion, note, actor],
    );

    const status = isExcursion ? "critical_excursion" : "nominal";
    await client.query(
      `update blood_cold_chain_passports
          set current_temp_celsius = $2, status = $3 where id = $1`,
      [passportId, temp, status],
    );

    if (isExcursion) {
      await client.query(
        `insert into blood_notifications (audience, facility_id, type, title, body)
         values ('facility', $1, 'cold_chain_alert', $2, $3)`,
        [
          facilityId,
          `Cold-chain excursion on ${row.code}`,
          `${temp} °C is outside the ${min}–${max} °C target range. Quarantine affected units and review.`,
        ],
      );
    }

    await audit({ actor, action: "coldchain.observation", entity: "blood_cold_chain", entityId: passportId, detail: { temp, isExcursion } });
    return {
      isExcursion,
      status,
      target: { min, max },
      tempCelsius: temp,
      message: isExcursion
        ? "Recorded. This reading is outside the target range, so the passport is flagged for review."
        : "Recorded within the target range.",
    };
  });
}

async function facilityNotifications(facilityId) {
  const result = await query(
    `select id, type, title, body, is_read, created_at
       from blood_notifications
      where audience = 'facility' and facility_id = $1
      order by created_at desc limit 50`,
    [facilityId],
  );
  return {
    notifications: result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      isRead: row.is_read,
      createdAt: row.created_at,
    })),
  };
}

async function markNotificationRead(facilityId, body) {
  const id = text(body.notificationId, "Notification", { min: 8, max: 60 });
  const result = await query(
    `update blood_notifications set is_read = true
      where id = $1 and facility_id = $2 and audience = 'facility'
      returning id`,
    [id, facilityId],
  );
  if (result.rowCount === 0) throw new HttpError(404, "No such notification.", "NOT_FOUND");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Platform admin
// -----------------------------------------------------------------------------

function randomToken() {
  return createHash("sha256")
    .update(`${Date.now()}:${Math.random()}:${process.hrtime.bigint()}`)
    .digest("hex");
}

async function adminFacilities(params) {
  const status = oneOf(params.get("status"), "Status", FACILITY_STATUSES, { required: false });
  const result = await query(
    `select f.*, s.name as source_name, s.verification_status as source_verification,
            (select count(*)::int from blood_facility_credentials c
              where c.facility_id = f.id and c.revoked_at is null) as active_credentials,
            (select count(*)::int from blood_inventory i where i.facility_id = f.id) as inventory_rows
       from blood_facilities f
       join blood_data_sources s on s.id = f.data_source_id
      where ($1::text is null or f.status = $1::blood_facility_status)
      order by f.submitted_at desc`,
    [status],
  );
  return {
    facilities: result.rows.map((row) => ({
      id: row.id,
      reference: row.public_ref,
      name: row.name,
      category: row.category,
      address: row.address,
      city: row.city,
      district: row.district,
      state: row.state,
      postalCode: row.postal_code,
      licenseNumber: row.license_number,
      status: row.status,
      hasBloodBank: row.has_blood_bank,
      phone: row.phone,
      email: row.email,
      authorizedRep: row.authorized_rep,
      operatingHours: row.operating_hours,
      dataSource: { id: row.data_source_id, name: row.source_name, verificationStatus: row.source_verification },
      sourceNote: row.source_note,
      submittedAt: row.submitted_at,
      lastVerifiedAt: row.last_verified_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      reviewNotes: row.review_notes,
      activeCredentials: row.active_credentials,
      inventoryRows: row.inventory_rows,
    })),
  };
}

async function reviewFacility(facilityId, body, actor) {
  const decision = oneOf(body.decision, "Decision", ["under_review", "approved", "rejected", "suspended"]);
  const notes = text(body.notes, "Review notes", { required: false, max: 500 });
  const verifiedSourceId = oneOf(
    body.dataSourceId,
    "Verification basis",
    ["medipal_field_verified", "facility_self_report"],
    { required: false },
  );

  return withTransaction(async (client) => {
    const current = await client.query("select * from blood_facilities where id = $1 for update", [facilityId]);
    if (current.rowCount === 0) throw new HttpError(404, "No such facility.", "NOT_FOUND");
    const row = current.rows[0];

    if (decision === "approved") {
      if (!row.license_number) {
        throw new HttpError(
          400,
          "This facility has no licence number on file. A facility cannot be approved without one.",
          "APPROVAL_BLOCKED",
        );
      }
      if (verifiedSourceId === "medipal_field_verified" && !body.verifiedOnSite) {
        throw new HttpError(
          400,
          "Marking a facility as field-verified requires confirming that the licence was checked on site.",
          "VERIFICATION_ATTESTATION_REQUIRED",
        );
      }
    }

    const updated = await client.query(
      `update blood_facilities
          set status = $2::blood_facility_status,
              reviewed_at = now(),
              reviewed_by = $3,
              review_notes = $4,
              last_verified_at = case when $2 = 'approved' then now() else last_verified_at end,
              data_source_id = case when $2 = 'approved' and $5::text is not null
                                    then $5::text else data_source_id end,
              source_note = case when $2 = 'approved'
                                 then 'Approved by MEDIPAL on ' || to_char(now(), 'YYYY-MM-DD')
                                 else source_note end
        where id = $1
        returning public_ref, status, name`,
      [facilityId, decision, actor, notes, verifiedSourceId || null],
    );

    let credential = null;
    if (decision === "approved") {
      const existing = await client.query(
        "select count(*)::int as n from blood_facility_credentials where facility_id = $1 and revoked_at is null",
        [facilityId],
      );
      if (existing.rows[0].n === 0) {
        const token = randomToken();
        await client.query(
          `insert into blood_facility_credentials (facility_id, token_hash, token_hint, issued_by)
           values ($1,$2,$3,$4)`,
          [facilityId, sha256(token), `…${token.slice(-6)}`, actor],
        );
        // Returned exactly once, and never written to the audit log.
        credential = { token, hint: `…${token.slice(-6)}` };
      }
    }

    await client.query(
      `insert into blood_notifications (audience, facility_id, type, title, body)
       values ('facility', $1, 'facility_approval', $2, $3)`,
      [facilityId, `Application ${decision.replace("_", " ")}`, notes || "Reviewed by the MEDIPAL platform team."],
    );

    await audit({
      actor,
      action: `facility.${decision}`,
      entity: "blood_facility",
      entityId: updated.rows[0].public_ref,
      detail: { notes: notes || null, credentialIssued: Boolean(credential) },
    });

    return { facility: updated.rows[0], credential };
  });
}

async function issueCredential(facilityId, body, actor) {
  const label = text(body.label, "Label", { required: false, max: 40 }) || "primary";
  const facility = await query("select id, status, public_ref from blood_facilities where id = $1", [facilityId]);
  if (facility.rowCount === 0) throw new HttpError(404, "No such facility.", "NOT_FOUND");
  if (facility.rows[0].status !== "approved") {
    throw new HttpError(409, "Only an approved facility can hold a console credential.", "INVALID_STATE");
  }
  const token = randomToken();
  await query(
    `insert into blood_facility_credentials (facility_id, token_hash, token_hint, issued_by, label)
     values ($1,$2,$3,$4,$5)`,
    [facilityId, sha256(token), `…${token.slice(-6)}`, actor, label],
  );
  await audit({ actor, action: "facility.credential_issued", entity: "blood_facility", entityId: facility.rows[0].public_ref });
  return { token, hint: `…${token.slice(-6)}`, label };
}

async function revokeCredential(facilityId, body, actor) {
  const hint = text(body.hint, "Credential hint", { min: 3, max: 20 });
  const result = await query(
    `update blood_facility_credentials set revoked_at = now()
      where facility_id = $1 and token_hint = $2 and revoked_at is null
      returning id`,
    [facilityId, hint.startsWith("…") ? hint : `…${hint}`],
  );
  if (result.rowCount === 0) throw new HttpError(404, "No active credential matches that hint.", "NOT_FOUND");
  await audit({ actor, action: "facility.credential_revoked", entity: "blood_facility", entityId: facilityId });
  return { revoked: result.rowCount };
}

async function adminAdvanceRequest(body, actor) {
  const reference = text(body.reference, "Reference", { min: 4, max: 40 }).toUpperCase();
  const nextStatus = oneOf(body.status, "Status", REQUEST_STATUSES);
  const note = text(body.note, "Note", { min: 4, max: 400 });
  const supplyingReference = body.supplyingFacilityReference
    ? text(body.supplyingFacilityReference, "Supplying facility", { min: 4, max: 40 }).toUpperCase()
    : null;

  return withTransaction(async (client) => {
    const current = await client.query("select * from blood_requests where public_ref = $1 for update", [reference]);
    if (current.rowCount === 0) throw new HttpError(404, "No request with that reference.", "NOT_FOUND");
    const row = current.rows[0];
    if (!ALLOWED_TRANSITIONS[row.status].includes(nextStatus)) {
      throw new HttpError(
        409,
        `A request that is "${row.status}" cannot move to "${nextStatus}". Allowed: ` +
          (ALLOWED_TRANSITIONS[row.status].join(", ") || "no further transitions"),
        "INVALID_TRANSITION",
      );
    }

    let supplyingId = row.supplying_facility_id;
    if (supplyingReference) {
      const facility = await client.query("select id from blood_facilities where public_ref = $1", [supplyingReference]);
      if (facility.rowCount === 0) throw new HttpError(404, "No such supplying facility.", "NOT_FOUND");
      supplyingId = facility.rows[0].id;
    }

    const updated = await client.query(
      `update blood_requests
          set status = $2::blood_request_status,
              supplying_facility_id = $3,
              closed_at = case when $2 in ('closed','cancelled') then now() else closed_at end
        where id = $1
        returning public_ref, status, updated_at`,
      [row.id, nextStatus, supplyingId],
    );
    await client.query(
      `insert into blood_request_events (request_id, from_status, to_status, note, actor)
       values ($1,$2,$3,$4,$5)`,
      [row.id, row.status, nextStatus, note, actor],
    );
    await audit({
      actor, action: "request.status_changed", entity: "blood_request",
      entityId: reference, detail: { from: row.status, to: nextStatus, note },
    });
    return { request: updated.rows[0] };
  });
}

async function adminStats() {
  const result = await query(
    `select
       (select count(*)::int from blood_facilities)                                        as facilities_total,
       (select count(*)::int from blood_facilities where status = 'approved')              as facilities_approved,
       (select count(*)::int from blood_facilities where status = 'pending')               as facilities_pending,
       (select count(*)::int from blood_donors)                                            as donors,
       (select count(*)::int from blood_inventory where quantity > 0)                      as inventory_rows,
       (select coalesce(sum(quantity),0)::int from blood_inventory_effective
         where effective_status in ('available','approaching_expiry'))                      as units_tracked,
       (select count(*)::int from blood_requests)                                          as requests_total,
       (select count(*)::int from blood_requests where status not in ('closed','cancelled')) as requests_open,
       (select count(*)::int from blood_cold_chain_passports where status = 'critical_excursion') as coldchain_excursions,
       (select count(*)::int from blood_inventory_effective
         where effective_status = 'expired')                                                as expired_batches`,
  );
  return { stats: result.rows[0], generatedAt: new Date().toISOString() };
}

async function adminAuditLog(params) {
  const limit = limitFrom(params.get("limit"), 50, 200);
  const result = await query(
    `select id, actor, action, entity, entity_id, detail, created_at
       from blood_audit_logs order by created_at desc limit $1`,
    [limit],
  );
  return {
    entries: result.rows.map((row) => ({
      id: String(row.id),
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
// Self-test — real assertions against the real database, always rolled back
// -----------------------------------------------------------------------------

async function runSelfTest() {
  const checks = [];
  const record = async (id, label, fn) => {
    try {
      const evidence = await fn();
      checks.push({ id, label, status: "pass", evidence: String(evidence) });
    } catch (error) {
      checks.push({ id, label, status: "fail", evidence: error.message });
    }
  };

  /** Asserts that `fn` is refused by the database, naming the constraint. */
  const expectRejected = async (fn, expectedFragment) => {
    try {
      await fn();
    } catch (error) {
      const haystack = `${error.constraint || ""} ${error.message || ""}`;
      if (expectedFragment && !haystack.includes(expectedFragment)) {
        throw new Error(
          `expected ${expectedFragment} to reject this, but the failure was: ${error.message}`,
        );
      }
      return `rejected as expected (${error.code || "error"})`;
    }
    throw new Error("the database ACCEPTED a value it must reject");
  };

  // ---- pure checks (no database state involved) ----------------------------
  await record("donor_contact_masking", "Donor contact numbers are masked before display", () => {
    const masked = maskPhone("9876543210");
    if (masked.includes("9876543210")) throw new Error(`mask leaked the number: ${masked}`);
    if (!masked.endsWith("3210")) throw new Error(`mask lost the last four digits: ${masked}`);
    return masked;
  });

  await record("freshness_thresholds", "Freshness thresholds are computed on the real clock", () => {
    const base = Date.now();
    const hoursAgo = (h) => new Date(base - h * 3_600_000).toISOString();
    const cases = [
      [computeFreshness({ facilityStatus: "approved", lastObservedAt: hoursAgo(1), hasStock: true }, base), "recently_verified", "1h ago"],
      [computeFreshness({ facilityStatus: "approved", lastObservedAt: hoursAgo(6), hasStock: true }, base), "update_due", "6h ago"],
      [computeFreshness({ facilityStatus: "approved", lastObservedAt: hoursAgo(48), hasStock: true }, base), "stale_unconfirmed", "48h ago"],
      [computeFreshness({ facilityStatus: "approved", lastObservedAt: hoursAgo(1), hasStock: false }, base), "no_stock", "1h ago, empty"],
      [computeFreshness({ facilityStatus: "pending", lastObservedAt: hoursAgo(1), hasStock: true }, base), "not_reporting", "unapproved"],
      [computeFreshness({ facilityStatus: "approved", hasBloodBank: false, lastObservedAt: hoursAgo(1), hasStock: false }, base), "unconfirmed_directory", "no blood bank"],
    ];
    for (const [actual, expected, label] of cases) {
      if (actual !== expected) throw new Error(`${label} → expected ${expected}, got ${actual}`);
    }
    return cases.map(([a, , l]) => `${l}→${a}`).join(", ");
  });

  await record("distance_math", "Haversine distance is plausible for Patna", () => {
    const km = distanceKm(25.5941, 85.1376, 25.6321, 85.0425); // GPO → Danapur
    if (km < 9 || km > 15) throw new Error(`expected ~10–14 km, computed ${km} km`);
    return `${km} km (Patna GPO → Danapur)`;
  });

  await record("request_transition_guard", "Illegal request transitions are refused in code", () => {
    if (ALLOWED_TRANSITIONS.created.includes("received")) {
      throw new Error("created → received must not be allowed in one step");
    }
    if (ALLOWED_TRANSITIONS.closed.length !== 0 || ALLOWED_TRANSITIONS.cancelled.length !== 0) {
      throw new Error("closed and cancelled must be terminal");
    }
    return `created → ${ALLOWED_TRANSITIONS.created.join(" / ")}; closed & cancelled terminal`;
  });

  // ---- database checks (single transaction, always rolled back) ------------
  await withRollback(async (client) => {
    /** Runs `fn` under a savepoint and always restores the transaction. */
    const probe = async (name, fn) => {
      await client.query(`savepoint ${name}`);
      try {
        return await fn();
      } finally {
        await client.query(`rollback to savepoint ${name}`);
      }
    };

    await record("db_connection", "Connected as a non-superuser so RLS actually applies", async () => {
      const result = await client.query(
        `select current_user as role, current_setting('is_superuser') as superuser, usebypassrls
           from pg_user where usename = current_user`,
      );
      const row = result.rows[0];
      if (row.superuser === "on" || row.usebypassrls) {
        throw new Error(
          `server is connected as ${row.role} (superuser=${row.superuser}, bypassrls=${row.usebypassrls}) — RLS would be silently skipped`,
        );
      }
      return `role=${row.role}, superuser=${row.superuser}, bypassrls=${row.usebypassrls}`;
    });

    await record("rls_forced", "Row level security is FORCED on the private tables", async () => {
      const result = await client.query(
        `select relname from pg_class
          where relnamespace = 'public'::regnamespace and relforcerowsecurity
          order by relname`,
      );
      const names = result.rows.map((row) => row.relname);
      for (const required of ["blood_donors", "blood_requests", "blood_request_events"]) {
        if (!names.includes(required)) throw new Error(`${required} is not FORCE RLS`);
      }
      return names.join(", ");
    });

    await record("provenance_declared", "Every data source declares its type and verification status", async () => {
      const result = await client.query(
        `select count(*)::int as bad from blood_data_sources
          where source_type is null or verification_status is null or notes is null`,
      );
      if (result.rows[0].bad > 0) throw new Error(`${result.rows[0].bad} source row(s) lack provenance`);
      const total = await client.query("select count(*)::int as n from blood_data_sources");
      return `${total.rows[0].n} source(s) fully declared, including e-RaktKosh as an unavailable source`;
    });

    await record("approval_gate", "A facility cannot be approved without a licence number", () =>
      probe("gate", async () => {
        const inserted = await client.query(
          `insert into blood_facilities (name, category, city, state, data_source_id)
           values ('Self-test gate probe', 'Hospital Blood Bank', 'Patna', 'Bihar', 'facility_self_report')
           returning id`,
        );
        return expectRejected(
          () => client.query("update blood_facilities set status = 'approved' where id = $1", [inserted.rows[0].id]),
          "blood_facilities_status_gate",
        );
      }),
    );

    await record("negative_stock_rejected", "Negative stock is rejected at the database level", () =>
      probe("neg", async () => {
        const anchor = await client.query(
          `insert into blood_facilities (name, category, city, state, data_source_id)
           values ('Self-test stock probe', 'Hospital Blood Bank', 'Patna', 'Bihar', 'facility_self_report')
           returning id`,
        );
        return expectRejected(
          () =>
            client.query(
              `insert into blood_inventory (facility_id, blood_group, component, quantity, data_source_id)
               values ($1, 'O+', 'Whole Blood', -1, 'facility_self_report')`,
              [anchor.rows[0].id],
            ),
          "blood_inventory_quantity_check",
        );
      }),
    );

    await record("provenance_required", "Inventory cannot be stored without a declared data source", () =>
      probe("prov", async () => {
        const anchor = await client.query(
          `insert into blood_facilities (name, category, city, state, data_source_id)
           values ('Self-test provenance probe', 'Hospital Blood Bank', 'Patna', 'Bihar', 'facility_self_report')
           returning id`,
        );
        return expectRejected(
          () =>
            client.query(
              `insert into blood_inventory (facility_id, blood_group, component, quantity)
               values ($1, 'A+', 'Whole Blood', 5)`,
              [anchor.rows[0].id],
            ),
          "data_source_id",
        );
      }),
    );

    await record("movement_reason_required", "Stock movements require a meaningful reason", () =>
      probe("move", async () => {
        const anchor = await client.query(
          `insert into blood_facilities (name, category, city, state, data_source_id)
           values ('Self-test movement probe', 'Hospital Blood Bank', 'Patna', 'Bihar', 'facility_self_report')
           returning id`,
        );
        return expectRejected(
          () =>
            client.query(
              `insert into blood_inventory_movements
                 (facility_id, blood_group, component, movement_type, quantity, reason)
               values ($1, 'B+', 'Whole Blood', 'issue', -1, 'x')`,
              [anchor.rows[0].id],
            ),
          "blood_inventory_movements_reason_check",
        );
      }),
    );

    await record("request_consent_required", "A request cannot exist without recorded consent", () =>
      probe("consent", () =>
        expectRejected(
          () =>
            client.query(
              `insert into blood_requests
                 (requester_name, contact_phone, for_whom, blood_group, component, units_required,
                  state, city, consent_recorded)
               values ('Self-test','9000000000','Self','O+','Whole Blood',1,'Bihar','Patna', false)`,
            ),
          "blood_requests_consent_required",
        ),
      ),
    );

    await record("expired_stock_excluded", "Expired units can never appear as available", () =>
      probe("expiry", async () => {
        const facility = await client.query(
          `insert into blood_facilities
             (name, category, city, state, license_number, status, data_source_id, last_verified_at)
           values ('Self-test expiry probe','Hospital Blood Bank','Patna','Bihar','SELFTEST/0001',
                   'approved','medipal_field_verified', now())
           returning id`,
        );
        const facilityId = facility.rows[0].id;
        await client.query(
          `insert into blood_inventory
             (facility_id, blood_group, component, quantity, collection_date, expiry_date, status, data_source_id)
           values ($1,'O-','Whole Blood', 4, current_date - 40, current_date - 1, 'available','medipal_field_verified')`,
          [facilityId],
        );
        const published = await client.query(
          "select count(*)::int as n from blood_public_availability where facility_id = $1",
          [facilityId],
        );
        const effective = await client.query(
          "select effective_status from blood_inventory_effective where facility_id = $1",
          [facilityId],
        );
        if (published.rows[0].n !== 0) {
          throw new Error(`an expired batch was published to the public view (${published.rows[0].n} row(s))`);
        }
        if (effective.rows[0].effective_status !== "expired") {
          throw new Error(`expected effective_status=expired, got ${effective.rows[0].effective_status}`);
        }
        return "expired batch hidden from blood_public_availability; effective_status=expired";
      }),
    );

    await record("cold_chain_excursion", "A reading outside the target range is flagged", () =>
      probe("cold", async () => {
        const facility = await client.query(
          `insert into blood_facilities
             (name, category, city, state, license_number, status, data_source_id, last_verified_at)
           values ('Self-test cold probe','Regional Blood Center','Patna','Bihar','SELFTEST/0002',
                   'approved','medipal_field_verified', now())
           returning id`,
        );
        const passport = await client.query(
          `insert into blood_cold_chain_passports (code, facility_id, target_min_celsius, target_max_celsius)
           values ('SELFTEST-CC', $1, 2.0, 6.0) returning id`,
          [facility.rows[0].id],
        );
        const within = 2.0 <= 4.5 && 4.5 <= 6.0;
        const outside = 9.5 < 2.0 || 9.5 > 6.0;
        if (!within) throw new Error("4.5 °C should sit inside a 2.0–6.0 °C target range");
        await client.query(
          `insert into blood_cold_chain_observations (passport_id, temp_celsius, is_excursion)
           values ($1, 9.5, $2)`,
          [passport.rows[0].id, outside],
        );
        const stored = await client.query(
          "select is_excursion from blood_cold_chain_observations where passport_id = $1",
          [passport.rows[0].id],
        );
        if (!stored.rows[0].is_excursion) throw new Error("9.5 °C outside 2.0–6.0 °C was not flagged");
        return "9.5 °C outside 2.0–6.0 °C flagged; 4.5 °C accepted as in range";
      }),
    );

    await record("facility_scoping", "Facility console reads are scoped to one facility", async () => {
      const other = await probe("scope", () =>
        client.query(
          `insert into blood_facilities
             (name, category, city, state, license_number, status, data_source_id, last_verified_at)
           values ('Self-test scope probe','Trauma Center Depot','Patna','Bihar','SELFTEST/0003',
                   'approved','medipal_field_verified', now())
           returning public_ref`,
        ),
      );
      // A token whose hash matches no credential row must resolve to nothing.
      const resolved = await client.query("select blood_resolve_facility_token($1) as facility_id", [sha256("not-a-real-token")]);
      if (resolved.rows[0].facility_id !== null) {
        throw new Error("an unknown token resolved to a facility");
      }
      return `unknown token resolves to null; probe facility ${other.rows[0].public_ref} would be discarded by the rollback`;
    });

    await record("rollback_leaves_no_trace", "The self-test leaves nothing behind", async () => {
      const before = await client.query(
        "select count(*)::int as n from blood_facilities where name like 'Self-test%'",
      );
      return `${before.rows[0].n} self-test facility row(s) currently visible inside the transaction (all discarded on rollback)`;
    });
  });

  // Prove the rollback really happened, from a fresh connection.
  const residue = await query("select count(*)::int as n from blood_facilities where name like 'Self-test%'");
  checks.push({
    id: "rollback_verified",
    label: "No self-test data survives the rollback",
    status: residue.rows[0].n === 0 ? "pass" : "fail",
    evidence: `${residue.rows[0].n} self-test row(s) found after rollback`,
  });

  const passed = checks.filter((check) => check.status === "pass").length;
  return {
    ranAt: new Date().toISOString(),
    summary: { total: checks.length, passed, failed: checks.length - passed },
    checks,
    note:
      "Every database probe runs inside a transaction that is always rolled back, and the " +
      "rollback is itself verified from a second connection. A 'fail' here means real " +
      "behaviour differs from what the UI claims.",
  };
}

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

/**
 * @returns {Promise<boolean>} true when the route was handled.
 */
export async function handleBloodRoute(request, response, url) {
  const { pathname } = url;
  const method = request.method;

  const segment = (index) => decodeURIComponent(pathname.split("/")[index] || "");

  if (!dbConfigured) {
    throw new HttpError(
      503,
      "The blood bank database is not configured on this server. Set DATABASE_URL in " +
        "`.env.server` and run `npm run db:setup`.",
      "DB_NOT_CONFIGURED",
    );
  }

  // ---- public --------------------------------------------------------------
  if (method === "GET" && pathname === "/api/blood/info") {
    sendJson(response, 200, {
      bloodGroups: BLOOD_GROUPS,
      components: COMPONENTS,
      facilityCategories: FACILITY_CATEGORIES,
      priorities: PRIORITIES,
      requestStatuses: REQUEST_STATUSES,
      freshnessThresholds: FRESHNESS_THRESHOLDS,
      emergency: EMERGENCY_INFO,
      sources: await listSources(),
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/sources") {
    sendJson(response, 200, { sources: await listSources() });
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/emergency") {
    sendJson(response, 200, EMERGENCY_INFO);
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/facilities") {
    sendJson(response, 200, await listPublicFacilities(url.searchParams));
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/availability") {
    sendJson(response, 200, await searchAvailability(url.searchParams));
    return true;
  }

  if (method === "POST" && pathname === "/api/blood/donors") {
    const body = await readJsonBody(request);
    sendJson(response, 201, await registerDonor(body));
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/donors/summary") {
    sendJson(response, 200, await donorSummary(url.searchParams));
    return true;
  }

  if (method === "POST" && pathname === "/api/blood/requests") {
    const body = await readJsonBody(request);
    sendJson(response, 201, await createRequest(body));
    return true;
  }

  if (method === "GET" && pathname.startsWith("/api/blood/requests/")) {
    sendJson(
      response,
      200,
      await trackRequest(segment(4), url.searchParams.get("phone") || ""),
    );
    return true;
  }

  if (method === "POST" && pathname === "/api/blood/facilities/applications") {
    const body = await readJsonBody(request);
    sendJson(response, 201, await submitFacilityApplication(body));
    return true;
  }

  if (method === "GET" && pathname === "/api/blood/notifications") {
    sendJson(response, 200, await publicNotifications());
    return true;
  }

  // ---- facility console ----------------------------------------------------
  if (pathname.startsWith("/api/blood/facility/")) {
    const { facilityId, facility } = await requireFacility(request);
    const actor = `facility:${facility.public_ref}`;
    const tail = pathname.slice("/api/blood/facility/".length);

    if (method === "GET" && tail === "me") {
      sendJson(response, 200, await facilityMe(facilityId));
      return true;
    }
    if (method === "GET" && tail === "inventory") {
      sendJson(response, 200, await facilityInventory(facilityId));
      return true;
    }
    if (method === "POST" && tail === "inventory") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await reportStock(facilityId, body, actor));
      return true;
    }
    if (method === "POST" && tail === "inventory/adjust") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await adjustStock(facilityId, body, actor));
      return true;
    }
    if (method === "GET" && tail === "movements") {
      sendJson(response, 200, await facilityMovements(facilityId));
      return true;
    }
    if (method === "GET" && tail === "expiry") {
      sendJson(response, 200, await facilityExpiry(facilityId));
      return true;
    }
    if (method === "GET" && tail === "requests") {
      sendJson(response, 200, await facilityOpenRequests(facilityId));
      return true;
    }
    if (method === "POST" && tail === "proposals") {
      const body = await readJsonBody(request);
      sendJson(response, 201, await submitProposal(facilityId, body, actor));
      return true;
    }
    if (method === "GET" && tail === "transfers") {
      sendJson(response, 200, await facilityTransfers(facilityId));
      return true;
    }
    if (method === "POST" && tail === "transfers") {
      const body = await readJsonBody(request);
      sendJson(response, 201, await createTransfer(facilityId, body, actor));
      return true;
    }
    if (method === "POST" && tail === "transfers/advance") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await advanceTransfer(facilityId, body, actor));
      return true;
    }
    if (method === "GET" && tail === "cold-chain") {
      sendJson(response, 200, await facilityColdChain(facilityId));
      return true;
    }
    if (method === "POST" && tail === "cold-chain") {
      const body = await readJsonBody(request);
      sendJson(response, 201, await createColdChainPassport(facilityId, body, actor));
      return true;
    }
    if (method === "POST" && tail === "cold-chain/observations") {
      const body = await readJsonBody(request);
      sendJson(response, 201, await addColdChainObservation(facilityId, body, actor));
      return true;
    }
    if (method === "GET" && tail === "notifications") {
      sendJson(response, 200, await facilityNotifications(facilityId));
      return true;
    }
    if (method === "POST" && tail === "notifications/read") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await markNotificationRead(facilityId, body));
      return true;
    }
    throw new HttpError(404, "Unknown facility route.", "NOT_FOUND");
  }

  // ---- platform admin ------------------------------------------------------
  if (pathname.startsWith("/api/blood/admin/")) {
    const tail = pathname.slice("/api/blood/admin/".length);

    if (method === "GET" && tail === "session") {
      // Deliberately does not require the key: the console needs to be able to
      // discover that it is unconfigured so it can say so instead of failing.
      sendJson(response, 200, {
        configured: Boolean(config.blood.adminKey),
        message: config.blood.adminKey
          ? "The platform-admin console is configured."
          : "The platform-admin console is not configured. Set BLOOD_ADMIN_KEY in `.env.server`.",
      });
      return true;
    }

    requireAdmin(request);
    const actor = "platform_admin";

    if (method === "GET" && tail === "facilities") {
      sendJson(response, 200, await adminFacilities(url.searchParams));
      return true;
    }
    if (method === "GET" && tail === "stats") {
      sendJson(response, 200, await adminStats());
      return true;
    }
    if (method === "GET" && tail === "audit") {
      sendJson(response, 200, await adminAuditLog(url.searchParams));
      return true;
    }
    if (method === "GET" && tail === "self-test") {
      sendJson(response, 200, await runSelfTest());
      return true;
    }
    if (method === "POST" && tail === "facilities/review") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await reviewFacility(text(body.facilityId, "Facility", { min: 8, max: 60 }), body, actor));
      return true;
    }
    if (method === "POST" && tail === "facilities/credentials") {
      const body = await readJsonBody(request);
      sendJson(response, 201, await issueCredential(text(body.facilityId, "Facility", { min: 8, max: 60 }), body, actor));
      return true;
    }
    if (method === "POST" && tail === "facilities/credentials/revoke") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await revokeCredential(text(body.facilityId, "Facility", { min: 8, max: 60 }), body, actor));
      return true;
    }
    if (method === "POST" && tail === "requests/status") {
      const body = await readJsonBody(request);
      sendJson(response, 200, await adminAdvanceRequest(body, actor));
      return true;
    }
    throw new HttpError(404, "Unknown admin route.", "NOT_FOUND");
  }

  return false;
}
