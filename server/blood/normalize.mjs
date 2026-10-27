/**
 * Blood data normalisation and validation.
 *
 * Every record that arrives from a provider passes through here BEFORE it can
 * reach the database. Nothing is coerced silently: a value that cannot be
 * normalised with confidence is rejected and the reason is recorded, because a
 * guessed blood group or a guessed unit count is a clinical safety problem, not
 * a cosmetic one.
 *
 * The canonical vocabularies below mirror the PostgreSQL enums in
 * `db/migrations/001_blood_bank.sql`. The database is the authority; if they
 * ever disagree, the insert fails loudly rather than storing a synonym.
 */

import { createHash } from "node:crypto";

export const BLOOD_GROUPS = Object.freeze(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

export const COMPONENTS = Object.freeze([
  "Packed Red Blood Cells",
  "Whole Blood",
  "Platelets",
  "Fresh Frozen Plasma",
  "Cryoprecipitate",
]);

export const AVAILABILITY_STATUSES = Object.freeze(["AVAILABLE", "LOW", "UNAVAILABLE", "UNKNOWN"]);

/** The reason codes a rejection can carry. Stable, so the admin UI can group them. */
export const ERROR_TYPES = Object.freeze({
  BLOOD_GROUP_INVALID: "BLOOD_GROUP_INVALID",
  COMPONENT_INVALID: "COMPONENT_INVALID",
  UNITS_INVALID: "UNITS_INVALID",
  UNITS_NEGATIVE: "UNITS_NEGATIVE",
  EXTERNAL_ID_INVALID: "EXTERNAL_ID_INVALID",
  DISTRICT_INVALID: "DISTRICT_INVALID",
  CENTRE_NAME_MISSING: "CENTRE_NAME_MISSING",
  TIMESTAMP_INVALID: "TIMESTAMP_INVALID",
  TIMESTAMP_IMPLAUSIBLE: "TIMESTAMP_IMPLAUSIBLE",
  STATUS_INVALID: "STATUS_INVALID",
  COORDINATES_INVALID: "COORDINATES_INVALID",
  CENTRE_UNRESOLVED: "CENTRE_UNRESOLVED",
  PAYLOAD_SHAPE_UNRECOGNISED: "PAYLOAD_SHAPE_UNRECOGNISED",
});

// ---------------------------------------------------------------------------
// Primitive normalisers
// ---------------------------------------------------------------------------

const collapse = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

/**
 * Normalises the many spellings of a blood group onto the eight canonical
 * values. Only a recognised form is accepted — anything else returns null and
 * the record is rejected.
 *
 *   "O+" "o positive" "O POS" "O Positive" "O+ve" -> "O+"
 *   "AB negative" "ab-ve" "ABNEG"                 -> "AB-"
 */
export function normalizeBloodGroup(value) {
  if (value === null || value === undefined) return null;
  const raw = collapse(value).toUpperCase();
  if (!raw) return null;

  // Fast path: already canonical.
  if (BLOOD_GROUPS.includes(raw)) return raw;

  const compact = raw.replace(/[\s._-]+/g, "");
  if (BLOOD_GROUPS.includes(compact)) return compact;

  const match = compact.match(/^(AB|A|B|O)(POS|POSITIVE|PLUS|P|1|NEG|NEGATIVE|MINUS|N|0)$/);
  if (!match) return null;
  const [, group, sign] = match;
  const positive = ["POS", "POSITIVE", "PLUS", "P", "1"].includes(sign);
  return `${group}${positive ? "+" : "-"}`;
}

/** Strips the trailing "-ve"/"ve" style suffix used by some Indian portals. */
function stripPositiveSuffix(token) {
  return token.replace(/(VE|POSITIVE|POS|NEGATIVE|NEG)$/, "");
}

/**
 * Normalises component names onto the five canonical values. Common clinical
 * abbreviations (PRBC, FFP, SDP, RDP, cryo) are handled because providers use
 * them constantly. An unrecognised component is rejected, never mapped to
 * "Whole Blood" as a fallback.
 */
export function normalizeComponent(value) {
  if (value === null || value === undefined) return null;
  const raw = collapse(value).toUpperCase();
  if (!raw) return null;

  const exact = COMPONENTS.find((component) => component.toUpperCase() === raw);
  if (exact) return exact;

  const compact = raw.replace(/[^A-Z]/g, "");
  const aliases = {
    WHOLEBLOOD: "Whole Blood",
    WB: "Whole Blood",
    PACKEDREDCELLS: "Packed Red Blood Cells",
    PACKEDREDBLOODCELLS: "Packed Red Blood Cells",
    PACKEDCELLS: "Packed Red Blood Cells",
    PRBC: "Packed Red Blood Cells",
    PRBCS: "Packed Red Blood Cells",
    RBC: "Packed Red Blood Cells",
    REDCELLS: "Packed Red Blood Cells",
    ERYTHROCYTES: "Packed Red Blood Cells",
    PLATELETS: "Platelets",
    PLATELET: "Platelets",
    PLATELETCONCENTRATE: "Platelets",
    RANDOMDONORPLATELETS: "Platelets",
    SINGLEDONORPLATELETS: "Platelets",
    SDP: "Platelets",
    RDP: "Platelets",
    PC: "Platelets",
    PLASMA: "Fresh Frozen Plasma",
    FRESHFROZENPLASMA: "Fresh Frozen Plasma",
    FFP: "Fresh Frozen Plasma",
    CRYOPRECIPITATE: "Cryoprecipitate",
    CRYO: "Cryoprecipitate",
    CRYOPPT: "Cryoprecipitate",
  };

  const mapped = aliases[stripPositiveSuffix(compact)] ?? aliases[compact];
  return mapped ?? null;
}

/**
 * Non-negative integer units. Accepts numeric strings and rejects anything with
 * a fractional part or a sign, so "-5" and "1.5" are refused rather than
 * rounded into a number the source never sent.
 */
export function normalizeUnits(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) return null;
    return value;
  }
  const raw = collapse(value);
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Provider identifiers must be short, opaque and printable. */
export function normalizeExternalId(value) {
  if (value === null || value === undefined) return null;
  const raw = collapse(value);
  if (!raw || raw.length > 128) return null;
  if (!/^[A-Za-z0-9._:\/-]+$/.test(raw)) return null;
  return raw;
}

/** Accepts ISO-8601 and "YYYY-MM-DD HH:mm:ss"; refuses anything unparseable. */
export function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = collapse(value);
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)
    ? `${raw.replace(" ", "T")}+05:30`
    : raw;
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

/**
 * A timestamp is implausible if it is in the future (beyond a small clock-skew
 * allowance) or older than the age of the programme itself. An impossible
 * timestamp means the source is unreliable for this record, so it is rejected.
 */
export function isPlausibleTimestamp(iso, now = Date.now(), skewMs = 15 * 60 * 1000) {
  if (!iso) return false;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return false;
  if (parsed - now > skewMs) return false;
  return parsed >= Date.UTC(2015, 0, 1);
}

/** District names are matched case- and punctuation-insensitively. */
export function normalizeDistrict(value, canonicalNames) {
  if (value === null || value === undefined) return null;
  const raw = collapse(value).toLowerCase().replace(/[^a-z]/g, "");
  if (!raw) return null;
  for (const name of canonicalNames) {
    const key = collapse(name).toLowerCase().replace(/[^a-z]/g, "");
    if (key === raw) return name;
  }
  return null;
}

/**
 * Maps a provider's centre type onto MEDIPAL's facility taxonomy, which is the
 * set the database enum accepts. Anything unrecognised lands on the neutral
 * "Hospital Blood Bank" bucket rather than being rejected: the category is a
 * presentation label, not a clinical fact, and refusing an otherwise valid
 * centre over it would hide real availability.
 */
export function normalizeFacilityCategory(value) {
  const raw = collapse(value).toUpperCase().replace(/[^A-Z]/g, "");
  if (!raw) return "Hospital Blood Bank";
  if (/(REGIONAL|STATE|DISTRICT|GOVT|GOVERNMENT).*(BLOOD)?(CENT|BANK)/.test(raw) || raw.includes("RBC")) {
    return "Regional Blood Center";
  }
  if (raw.includes("TRAUMA")) return "Trauma Center Depot";
  if (raw.includes("MOBILE") || raw.includes("CAMPAIGN") || raw.includes("CAMP")) {
    return "Mobile Collection Hub";
  }
  return "Hospital Blood Bank";
}

export function normalizeAvailabilityStatus(value) {
  if (value === null || value === undefined) return null;
  const raw = collapse(value).toUpperCase().replace(/\s+/g, "_");
  if (AVAILABILITY_STATUSES.includes(raw)) return raw;
  const aliases = {
    AVAILABLE_STOCK: "AVAILABLE",
    IN_STOCK: "AVAILABLE",
    SUFFICIENT: "AVAILABLE",
    LOW_STOCK: "LOW",
    CRITICAL: "LOW",
    LIMITED: "LOW",
    NOT_AVAILABLE: "UNAVAILABLE",
    OUT_OF_STOCK: "UNAVAILABLE",
    NONE: "UNAVAILABLE",
    ZERO: "UNAVAILABLE",
    NO_STOCK: "UNAVAILABLE",
  };
  return aliases[raw] ?? null;
}

/**
 * The status a row gets when the provider reports only a number. The threshold
 * is configurable precisely because MEDIPAL has no clinical basis for choosing
 * one, and the derived status is always labelled as derived.
 */
export function deriveAvailabilityStatus(units, lowUnitsThreshold) {
  if (!Number.isFinite(units)) return "UNKNOWN";
  if (units <= 0) return "UNAVAILABLE";
  if (units <= lowUnitsThreshold) return "LOW";
  return "AVAILABLE";
}

export function validateCoordinates(latitude, longitude) {
  const lat = typeof latitude === "number" ? latitude : Number.parseFloat(String(latitude ?? ""));
  const lng = typeof longitude === "number" ? longitude : Number.parseFloat(String(longitude ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // 0,0 is the classic "field was left empty" placeholder; treat it as absent.
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

/** Stable, non-reversible fingerprint of a rejected payload, for correlation. */
export function payloadHash(payload) {
  return createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex").slice(0, 32);
}

/**
 * A truncated, credential-free excerpt of a rejected record. Keys that could
 * carry a secret are dropped outright rather than masked, so the value can
 * never be recovered from an error row.
 */
export function safeExcerpt(payload, maxLength = 400) {
  const BLOCKED = /token|secret|key|password|auth|cookie|session/i;
  const out = {};
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const [key, value] of Object.entries(payload)) {
      if (BLOCKED.test(key)) continue;
      const text = typeof value === "object" ? JSON.stringify(value) : String(value);
      out[key] = text.length > 120 ? `${text.slice(0, 117)}...` : text;
    }
  } else if (payload !== undefined) {
    out.value = String(payload).slice(0, 120);
  }
  const serialised = JSON.stringify(out);
  return serialised.length > maxLength ? `${serialised.slice(0, maxLength - 3)}...` : serialised;
}

// ---------------------------------------------------------------------------
// Record-level normalisation
// ---------------------------------------------------------------------------

/**
 * Normalises a provider centre record.
 *
 * Required: an external id and a name. Everything else is optional but, when
 * present, must be valid — a malformed district or coordinate is an error
 * rather than a silent NULL, because it means the feed is not what was agreed.
 */
export function normalizeCentreRecord(record, { districtNames = [], allowEmptyExternalId = false } = {}) {
  const errors = [];
  const source = record && typeof record === "object" ? record : {};

  const externalId = normalizeExternalId(source.externalId ?? source.external_id ?? source.id);
  if (!externalId && !allowEmptyExternalId) {
    errors.push({ type: ERROR_TYPES.EXTERNAL_ID_INVALID, message: "Centre record has no usable provider identifier." });
  }

  const name = collapse(source.name ?? source.centreName ?? source.centre_name ?? source.bloodBankName);
  if (!name) {
    errors.push({ type: ERROR_TYPES.CENTRE_NAME_MISSING, message: "Centre record has no name." });
  }

  const rawDistrict = source.district ?? source.districtName ?? source.district_name ?? null;
  let district = null;
  if (rawDistrict) {
    district = normalizeDistrict(rawDistrict, districtNames);
    if (!district) {
      errors.push({
        type: ERROR_TYPES.DISTRICT_INVALID,
        message: `District "${collapse(rawDistrict)}" is not a known Bihar district.`,
      });
    }
  }

  const state = collapse(source.state ?? "Bihar") || "Bihar";

  let coordinates = null;
  const hasCoordinateField =
    source.latitude !== undefined || source.longitude !== undefined || source.lat !== undefined || source.lng !== undefined;
  if (hasCoordinateField) {
    coordinates = validateCoordinates(
      source.latitude ?? source.lat,
      source.longitude ?? source.lng ?? source.lon,
    );
    if (!coordinates) {
      errors.push({
        type: ERROR_TYPES.COORDINATES_INVALID,
        message: "Centre coordinates are outside the valid range.",
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      externalId: externalId ?? null,
      name: name || null,
      category: normalizeFacilityCategory(source.category ?? source.type ?? source.facilityType),
      address: collapse(source.address ?? source.addressLine ?? "") || null,
      city: collapse(source.city ?? source.town ?? "") || null,
      district,
      state,
      postalCode: collapse(source.pincode ?? source.postalCode ?? source.zip ?? "") || null,
      phone: collapse(source.phone ?? source.contact ?? source.mobile ?? "") || null,
      email: collapse(source.email ?? "") || null,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      operatingHours: collapse(source.operatingHours ?? source.timings ?? "") || null,
      sourceUrl: collapse(source.sourceUrl ?? source.url ?? "") || null,
      verification: collapse(source.verificationStatus ?? "") || null,
    },
  };
}

/**
 * Normalises a provider inventory record. `bloodGroup`, `component` and a
 * non-negative integer unit count are mandatory. The source timestamp is
 * mandatory too: without it a figure cannot honestly be called live, so the
 * record is refused rather than stamped with our own clock.
 */
export function normalizeInventoryRecord(record, { districtNames = [], lowUnitsThreshold = 3, now = Date.now() } = {}) {
  const errors = [];
  const source = record && typeof record === "object" ? record : {};

  const centreExternalId = normalizeExternalId(
    source.centreExternalId ?? source.centre_external_id ?? source.centreId ?? source.centre_id ?? source.bloodBankId ?? source.blood_bank_id,
  );
  if (!centreExternalId) {
    errors.push({
      type: ERROR_TYPES.EXTERNAL_ID_INVALID,
      message: "Inventory record does not identify its centre.",
    });
  }

  const bloodGroup = normalizeBloodGroup(source.bloodGroup ?? source.blood_group ?? source.group ?? source.blood);
  if (!bloodGroup) {
    errors.push({
      type: ERROR_TYPES.BLOOD_GROUP_INVALID,
      message: `Blood group "${collapse(source.bloodGroup ?? source.blood_group ?? source.group ?? "")}" is not one of A+/A-/B+/B-/AB+/AB-/O+/O-.`,
    });
  }

  const component = normalizeComponent(source.component ?? source.componentName ?? source.product ?? source.bloodComponent);
  if (!component) {
    errors.push({
      type: ERROR_TYPES.COMPONENT_INVALID,
      message: `Component "${collapse(source.component ?? source.product ?? "")}" is not a recognised blood component.`,
    });
  }

  const rawUnits = source.units ?? source.quantity ?? source.availableUnits ?? source.count;
  const units = normalizeUnits(rawUnits);
  if (units === null) {
    const looksNegative = typeof rawUnits === "number" ? rawUnits < 0 : /^-/.test(collapse(rawUnits));
    errors.push({
      type: looksNegative ? ERROR_TYPES.UNITS_NEGATIVE : ERROR_TYPES.UNITS_INVALID,
      message: looksNegative
        ? `Unit count ${collapse(rawUnits)} is negative and was rejected.`
        : `Unit count "${collapse(rawUnits)}" is not a non-negative whole number.`,
    });
  }

  const timestampRaw = source.sourceUpdatedAt ?? source.source_updated_at ?? source.updatedAt ?? source.lastUpdated ?? source.last_updated;
  const sourceUpdatedAt = normalizeTimestamp(timestampRaw);
  if (!sourceUpdatedAt) {
    errors.push({
      type: ERROR_TYPES.TIMESTAMP_INVALID,
      message: "Inventory record carries no parseable source timestamp.",
    });
  } else if (!isPlausibleTimestamp(sourceUpdatedAt, now)) {
    errors.push({
      type: ERROR_TYPES.TIMESTAMP_IMPLAUSIBLE,
      message: `Source timestamp ${sourceUpdatedAt} is implausible (in the future or before 2015).`,
    });
  }

  // Only validated when the centre record itself carried a district; a feed
  // that omits districts entirely is not an error.
  const rawDistrict = source.district ?? source.districtName ?? null;
  let district = null;
  if (rawDistrict) {
    district = normalizeDistrict(rawDistrict, districtNames);
    if (!district && districtNames.length > 0) {
      errors.push({
        type: ERROR_TYPES.DISTRICT_INVALID,
        message: `District "${collapse(rawDistrict)}" is not a known Bihar district.`,
      });
    }
  }

  const declaredStatus = normalizeAvailabilityStatus(source.availabilityStatus ?? source.status ?? source.availability);
  if (declaredStatus === null && (source.availabilityStatus ?? source.status ?? source.availability) !== undefined) {
    const rawStatus = collapse(source.availabilityStatus ?? source.status ?? source.availability);
    if (rawStatus) {
      errors.push({
        type: ERROR_TYPES.STATUS_INVALID,
        message: `Availability status "${rawStatus}" is not one of AVAILABLE/LOW/UNAVAILABLE/UNKNOWN.`,
      });
    }
  }

  const recordId = normalizeExternalId(
    source.sourceRecordId ?? source.source_record_id ?? source.recordId ?? source.id,
  ) ?? (centreExternalId && bloodGroup && component ? `${centreExternalId}:${bloodGroup}:${component}` : null);

  return {
    ok: errors.length === 0,
    errors,
    value: {
      centreExternalId: centreExternalId ?? null,
      sourceRecordId: recordId,
      bloodGroup: bloodGroup ?? null,
      component: component ?? null,
      units: units ?? null,
      /**
       * A provider's own verdict always wins. When it sends only a number we
       * derive one and record that it was derived, so the UI can say so.
       */
      availabilityStatus: declaredStatus ?? deriveAvailabilityStatus(units ?? NaN, lowUnitsThreshold),
      statusIsDerived: declaredStatus === null,
      district,
      sourceUpdatedAt: sourceUpdatedAt ?? null,
      unit: collapse(source.unit ?? "Units") || "Units",
    },
  };
}
