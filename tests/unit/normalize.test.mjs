/**
 * §8 / §27 — normalisation and validation.
 *
 * Every record a provider sends must be normalised before it can reach the
 * database, and anything that cannot be normalised with confidence must be
 * REJECTED (with a reason) rather than coerced. These tests hold that line:
 * a guessed blood group or a guessed unit count is a clinical safety problem.
 */

import "./../helpers/env.mjs";

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BLOOD_GROUPS,
  COMPONENTS,
  ERROR_TYPES,
  normalizeBloodGroup,
  normalizeComponent,
  normalizeUnits,
  normalizeExternalId,
  normalizeTimestamp,
  isPlausibleTimestamp,
  normalizeDistrict,
  normalizeAvailabilityStatus,
  deriveAvailabilityStatus,
  validateCoordinates,
  payloadHash,
  safeExcerpt,
  normalizeCentreRecord,
  normalizeInventoryRecord,
} from "../../server/blood/normalize.mjs";

const BIHAR_DISTRICTS = ["Patna", "Gaya", "Muzaffarpur", "Nalanda", "East Champaran"];

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const minutesAhead = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();

describe("blood-group normalisation (§27)", () => {
  it("accepts all eight canonical groups unchanged", () => {
    // The exact eight groups the specification names, verbatim.
    for (const group of ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"]) {
      assert.equal(normalizeBloodGroup(group), group);
    }
    assert.equal(BLOOD_GROUPS.length, 8);
  });

  it("is idempotent — normalising a normalised value changes nothing", () => {
    for (const group of BLOOD_GROUPS) {
      assert.equal(normalizeBloodGroup(normalizeBloodGroup(group)), group);
    }
  });

  it("folds the common long forms onto the canonical value", () => {
    assert.equal(normalizeBloodGroup("o positive"), "O+");
    assert.equal(normalizeBloodGroup("O POSITIVE"), "O+");
    assert.equal(normalizeBloodGroup("O POS"), "O+");
    assert.equal(normalizeBloodGroup("O Positive"), "O+");
    assert.equal(normalizeBloodGroup("a plus"), "A+");
    assert.equal(normalizeBloodGroup("AB negative"), "AB-");
    assert.equal(normalizeBloodGroup("ab neg"), "AB-");
    assert.equal(normalizeBloodGroup("b minus"), "B-");
    assert.equal(normalizeBloodGroup("  b+  "), "B+");
    assert.equal(normalizeBloodGroup("o+"), "O+");
  });

  it("refuses anything it cannot recognise instead of guessing", () => {
    // "AB" alone is ambiguous, "O" alone states no sign, and "Bombay" is a
    // different phenotype — none may be silently mapped to a group.
    for (const bad of ["AB", "O", "A", "B", "ABX", "Bombay", "O++", "positive", "", "   ", null, undefined, 42, {}]) {
      assert.equal(normalizeBloodGroup(bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
    }
  });
});

describe("component normalisation (§27)", () => {
  it("accepts the five canonical components verbatim", () => {
    for (const component of COMPONENTS) {
      assert.equal(normalizeComponent(component), component);
    }
  });

  it("resolves the clinical abbreviations providers actually send", () => {
    assert.equal(normalizeComponent("PRBC"), "Packed Red Blood Cells");
    assert.equal(normalizeComponent("prbcs"), "Packed Red Blood Cells");
    assert.equal(normalizeComponent("RBC"), "Packed Red Blood Cells");
    assert.equal(normalizeComponent("Whole Blood"), "Whole Blood");
    assert.equal(normalizeComponent("wb"), "Whole Blood");
    assert.equal(normalizeComponent("SDP"), "Platelets");
    assert.equal(normalizeComponent("Platelet Concentrate"), "Platelets");
    assert.equal(normalizeComponent("FFP"), "Fresh Frozen Plasma");
    assert.equal(normalizeComponent("Plasma"), "Fresh Frozen Plasma");
    assert.equal(normalizeComponent("cryo"), "Cryoprecipitate");
    assert.equal(normalizeComponent("Cryoprecipitate"), "Cryoprecipitate");
  });

  it("never falls back to Whole Blood for an unknown component", () => {
    // This is the important one: a silent fallback would misreport a component.
    for (const bad of ["Unobtainium", "", "   ", null, undefined, "Plasma Frozen Fresh"]) {
      assert.equal(normalizeComponent(bad), null);
    }
  });
});

describe("unit counts (§8)", () => {
  it("accepts zero and positive whole numbers, as numbers or strings", () => {
    assert.equal(normalizeUnits(0), 0);
    assert.equal(normalizeUnits(7), 7);
    assert.equal(normalizeUnits("7"), 7);
    assert.equal(normalizeUnits("007"), 7);
    assert.equal(normalizeUnits(" 12 "), 12);
  });

  it("rejects the negative and fractional values the spec calls out", () => {
    // The specification's own example: units = -5 must be refused, not stored.
    assert.equal(normalizeUnits(-5), null);
    assert.equal(normalizeUnits("-5"), null);
    assert.equal(normalizeUnits(1.5), null);
    assert.equal(normalizeUnits("1.5"), null);
    assert.equal(normalizeUnits("7a"), null);
    assert.equal(normalizeUnits(""), null);
    assert.equal(normalizeUnits(null), null);
    assert.equal(normalizeUnits(undefined), null);
    assert.equal(normalizeUnits(NaN), null);
  });
});

describe("provider identifiers (§8)", () => {
  it("accepts short opaque ids and refuses malformed ones", () => {
    assert.equal(normalizeExternalId("BB-1024"), "BB-1024");
    assert.equal(normalizeExternalId("a/b:c_d.e"), "a/b:c_d.e");
    assert.equal(normalizeExternalId(""), null);
    assert.equal(normalizeExternalId("has space"), null);
    assert.equal(normalizeExternalId("x".repeat(129)), null);
    assert.equal(normalizeExternalId(null), null);
  });
});

describe("timestamps and plausibility (§8)", () => {
  it("parses ISO-8601 and the space-separated form Indian portals emit", () => {
    assert.equal(normalizeTimestamp("2026-10-27T10:15:00+05:30"), "2026-10-27T04:45:00.000Z");
    // "YYYY-MM-DD HH:mm:ss" is read as IST (+05:30), the operator's timezone.
    assert.equal(normalizeTimestamp("2026-10-27 10:15:00"), "2026-10-27T04:45:00.000Z");
    assert.equal(normalizeTimestamp("2026-10-27 10:15"), "2026-10-27T04:45:00.000Z");
  });

  it("refuses an unparseable timestamp rather than defaulting to now", () => {
    for (const bad of ["not a date", "", "   ", null, undefined, "27/10/2026"]) {
      assert.equal(normalizeTimestamp(bad), null);
    }
  });

  it("treats a future or pre-programme timestamp as implausible", () => {
    assert.equal(isPlausibleTimestamp(minutesAgo(2)), true);
    assert.equal(isPlausibleTimestamp(minutesAhead(5)), true); // clock skew is tolerated
    assert.equal(isPlausibleTimestamp(minutesAhead(120)), false); // a real future date is not
    assert.equal(isPlausibleTimestamp("2010-01-01T00:00:00.000Z"), false);
    assert.equal(isPlausibleTimestamp(null), false);
  });
});

describe("district matching (§8)", () => {
  it("matches case- and punctuation-insensitively against the canonical list", () => {
    assert.equal(normalizeDistrict("Patna", BIHAR_DISTRICTS), "Patna");
    assert.equal(normalizeDistrict("  patna ", BIHAR_DISTRICTS), "Patna");
    assert.equal(normalizeDistrict("NALANDA", BIHAR_DISTRICTS), "Nalanda");
    assert.equal(normalizeDistrict("East-Champaran", BIHAR_DISTRICTS), "East Champaran");
  });

  it("rejects a district outside the canonical list", () => {
    assert.equal(normalizeDistrict("Mumbai", BIHAR_DISTRICTS), null);
    assert.equal(normalizeDistrict("", BIHAR_DISTRICTS), null);
    assert.equal(normalizeDistrict(null, BIHAR_DISTRICTS), null);
  });
});

describe("availability status (§4, §8)", () => {
  it("copies a state the provider itself stated", () => {
    assert.equal(normalizeAvailabilityStatus("available"), "AVAILABLE");
    assert.equal(normalizeAvailabilityStatus("In Stock"), "AVAILABLE");
    assert.equal(normalizeAvailabilityStatus("LOW"), "LOW");
    assert.equal(normalizeAvailabilityStatus("Critical"), "LOW");
    assert.equal(normalizeAvailabilityStatus("out of stock"), "UNAVAILABLE");
    assert.equal(normalizeAvailabilityStatus("UNKNOWN"), "UNKNOWN");
  });

  it("returns null for a status it cannot recognise, so the record is refused", () => {
    assert.equal(normalizeAvailabilityStatus("maybe"), null);
    assert.equal(normalizeAvailabilityStatus(undefined), null);
  });

  it("derives a status from units only when the provider stated none", () => {
    assert.equal(deriveAvailabilityStatus(0, 3), "UNAVAILABLE");
    assert.equal(deriveAvailabilityStatus(2, 3), "LOW");
    assert.equal(deriveAvailabilityStatus(3, 3), "LOW");
    assert.equal(deriveAvailabilityStatus(4, 3), "AVAILABLE");
    // No number at all is UNKNOWN — never AVAILABLE by omission.
    assert.equal(deriveAvailabilityStatus(NaN, 3), "UNKNOWN");
  });
});

describe("coordinates", () => {
  it("accepts a real position and rejects the 0,0 placeholder", () => {
    assert.deepEqual(validateCoordinates(25.5941, 85.1376), { latitude: 25.5941, longitude: 85.1376 });
    assert.deepEqual(validateCoordinates("25.5941", "85.1376"), { latitude: 25.5941, longitude: 85.1376 });
    assert.equal(validateCoordinates(0, 0), null);
    assert.equal(validateCoordinates(91, 0), null);
    assert.equal(validateCoordinates(0, 181), null);
    assert.equal(validateCoordinates("abc", "x"), null);
  });
});

describe("rejected-payload safety (§8, §20)", () => {
  it("never lets a credential survive into an error excerpt", () => {
    const excerpt = safeExcerpt({
      externalId: "BB-1",
      bloodGroup: "O+",
      apiKey: "SUPER-SECRET-KEY",
      apiSecret: "SUPER-SECRET-VALUE",
      Authorization: "Bearer SUPER-SECRET-TOKEN",
      password: "hunter2",
      sessionToken: "SESSION-SECRET",
    });

    assert.ok(excerpt.includes("BB-1"), "the record's own fields must be kept");
    for (const secret of ["SUPER-SECRET-KEY", "SUPER-SECRET-VALUE", "SUPER-SECRET-TOKEN", "hunter2", "SESSION-SECRET"]) {
      assert.ok(!excerpt.includes(secret), `excerpt leaked ${secret}`);
    }
  });

  it("fingerprints a payload stably and irreversibly", () => {
    const payload = { a: 1, b: "two" };
    assert.equal(payloadHash(payload), payloadHash({ a: 1, b: "two" }));
    assert.notEqual(payloadHash(payload), payloadHash({ a: 1, b: "three" }));
    assert.equal(payloadHash(payload).length, 32);
    assert.ok(!payloadHash(payload).includes("two"));
  });
});

describe("centre records (§8)", () => {
  const base = { externalId: "BB-1", name: "Sadar Blood Bank", district: "Patna", state: "Bihar" };

  it("accepts a record with an id, a name and a known district", () => {
    const result = normalizeCentreRecord(base, { districtNames: BIHAR_DISTRICTS });
    assert.equal(result.ok, true);
    assert.equal(result.value.externalId, "BB-1");
    assert.equal(result.value.name, "Sadar Blood Bank");
    assert.equal(result.value.district, "Patna");
    assert.equal(result.value.state, "Bihar");
  });

  it("rejects a record with no identifier or no name", () => {
    const noId = normalizeCentreRecord({ ...base, externalId: undefined }, { districtNames: BIHAR_DISTRICTS });
    assert.equal(noId.ok, false);
    assert.equal(noId.errors[0].type, ERROR_TYPES.EXTERNAL_ID_INVALID);

    const noName = normalizeCentreRecord({ ...base, name: "  " }, { districtNames: BIHAR_DISTRICTS });
    assert.equal(noName.ok, false);
    assert.equal(noName.errors[0].type, ERROR_TYPES.CENTRE_NAME_MISSING);
  });

  it("rejects an unknown district and an out-of-range coordinate", () => {
    const badDistrict = normalizeCentreRecord({ ...base, district: "Mumbai" }, { districtNames: BIHAR_DISTRICTS });
    assert.equal(badDistrict.ok, false);
    assert.equal(badDistrict.errors[0].type, ERROR_TYPES.DISTRICT_INVALID);

    const badCoords = normalizeCentreRecord({ ...base, latitude: 999, longitude: 85 }, { districtNames: BIHAR_DISTRICTS });
    assert.equal(badCoords.ok, false);
    assert.equal(badCoords.errors[0].type, ERROR_TYPES.COORDINATES_INVALID);
  });
});

describe("inventory records (§8, §27)", () => {
  const valid = {
    centreExternalId: "BB-1",
    bloodGroup: "O+",
    component: "Platelets",
    units: 7,
    sourceUpdatedAt: minutesAgo(2),
  };

  it("accepts a complete record and derives an explicitly-marked status", () => {
    const result = normalizeInventoryRecord(valid, { districtNames: BIHAR_DISTRICTS, lowUnitsThreshold: 3 });
    assert.equal(result.ok, true);
    assert.equal(result.value.bloodGroup, "O+");
    assert.equal(result.value.component, "Platelets");
    assert.equal(result.value.units, 7);
    assert.equal(result.value.availabilityStatus, "AVAILABLE");
    assert.equal(result.value.statusIsDerived, true, "a derived status must be labelled as derived");
    assert.equal(result.value.sourceRecordId, "BB-1:O+:Platelets");
  });

  it("prefers a status the provider stated over one derived from units", () => {
    const result = normalizeInventoryRecord(
      { ...valid, status: "in stock" },
      { districtNames: BIHAR_DISTRICTS, lowUnitsThreshold: 3 },
    );
    assert.equal(result.ok, true);
    assert.equal(result.value.availabilityStatus, "AVAILABLE");
    assert.equal(result.value.statusIsDerived, false);
  });

  it("rejects negative units with the specific reason (§8)", () => {
    const result = normalizeInventoryRecord({ ...valid, units: -5 }, { districtNames: BIHAR_DISTRICTS });
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].type, ERROR_TYPES.UNITS_NEGATIVE);
  });

  it("rejects a record with no usable unit count, group, component or centre", () => {
    const cases = [
      [{ ...valid, units: "many" }, ERROR_TYPES.UNITS_INVALID],
      [{ ...valid, bloodGroup: "XY" }, ERROR_TYPES.BLOOD_GROUP_INVALID],
      [{ ...valid, component: "Unobtainium" }, ERROR_TYPES.COMPONENT_INVALID],
      [{ ...valid, centreExternalId: "" }, ERROR_TYPES.EXTERNAL_ID_INVALID],
      [{ ...valid, status: "perhaps" }, ERROR_TYPES.STATUS_INVALID],
    ];
    for (const [record, expected] of cases) {
      const result = normalizeInventoryRecord(record, { districtNames: BIHAR_DISTRICTS });
      assert.equal(result.ok, false, `expected ${expected} to be rejected`);
      assert.equal(result.errors[0].type, expected);
    }
  });

  it("refuses a record with no source timestamp rather than stamping our own clock (§5)", () => {
    // Without the source's own observation time a figure can never be called
    // live, so the record is refused instead of being given `now()`.
    const missing = normalizeInventoryRecord({ ...valid, sourceUpdatedAt: undefined }, { districtNames: BIHAR_DISTRICTS });
    assert.equal(missing.ok, false);
    assert.equal(missing.errors[0].type, ERROR_TYPES.TIMESTAMP_INVALID);

    const impossible = normalizeInventoryRecord(
      { ...valid, sourceUpdatedAt: minutesAhead(180) },
      { districtNames: BIHAR_DISTRICTS },
    );
    assert.equal(impossible.ok, false);
    assert.equal(impossible.errors[0].type, ERROR_TYPES.TIMESTAMP_IMPLAUSIBLE);
  });
});
