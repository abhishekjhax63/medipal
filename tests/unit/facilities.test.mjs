/**
 * §1 / §3 / §5 / §6 — the real healthcare facility source.
 *
 * These tests drive `server/overpass.mjs` directly with a stubbed `fetch`, so
 * normalisation, de-duplication, distance and the provider contract can be
 * checked without touching the public OpenStreetMap services.
 *
 * The honesty rules under test:
 *  - a tag OpenStreetMap does not carry stays `null` (never a placeholder);
 *  - a record with neither a name nor an address is dropped;
 *  - a node/way pair for the same place collapses, and a real value is never
 *    overwritten by `null`;
 *  - no record ever carries a blood-stock figure — a location is not evidence.
 */

import "../helpers/env.mjs";

import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  OSM_ATTRIBUTION,
  OSM_SOURCES,
  clearFacilityCache,
  dedupeFacilities,
  distanceMeters,
  filterAndSort,
  geocodePlace,
  normalizeElement,
  searchFacilities,
} from "../../server/overpass.mjs";

const realFetch = globalThis.fetch;
let calls = [];

function stubFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return handler(String(url), init || {});
  };
}

function jsonResponse(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    // A real `Response` always carries headers, so the stub does too — the
    // provider reads `Retry-After` off them when a source rate-limits us.
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => payload,
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
  clearFacilityCache();
});

describe("OpenStreetMap facility normalisation (§1, §6)", () => {
  it("maps the tags OSM actually carries onto a facility record", () => {
    const record = normalizeElement({
      type: "node",
      id: 123,
      lat: 25.61,
      lon: 85.14,
      tags: {
        amenity: "hospital",
        name: "Patna Medical College Hospital",
        "addr:housenumber": "12",
        "addr:street": "Ashok Rajpath",
        "addr:city": "Patna",
        "addr:postcode": "800004",
        phone: "+91 612 230 0000",
        website: "https://pmch.example",
        opening_hours: "24/7",
        emergency: "yes",
      },
    });

    assert.equal(record.name, "Patna Medical College Hospital");
    assert.equal(record.kind, "hospital");
    assert.equal(record.phone, "+91 612 230 0000");
    assert.equal(record.website, "https://pmch.example");
    assert.equal(record.openingHours, "24/7");
    assert.equal(record.city, "Patna");
    assert.equal(record.postalCode, "800004");
    assert.equal(record.address, "12, Ashok Rajpath, Patna, 800004");
    assert.equal(record.emergency, true);
    assert.equal(record.source, OSM_SOURCES.directory);
    assert.equal(record.sourceUrl, "https://www.openstreetmap.org/node/123");
  });

  it("leaves a field the source does not publish as null — never a placeholder", () => {
    const record = normalizeElement({
      type: "node",
      id: 7,
      lat: 25.6,
      lon: 85.1,
      tags: { amenity: "clinic", name: "Small Clinic" },
    });

    assert.equal(record.phone, null);
    assert.equal(record.website, null);
    assert.equal(record.openingHours, null);
    assert.equal(record.postalCode, null);
    assert.equal(record.emergency, false);
  });

  it("drops a record with neither a name nor an address", () => {
    const dropped = normalizeElement({
      type: "node",
      id: 9,
      lat: 25.6,
      lon: 85.1,
      tags: { amenity: "hospital" },
    });
    assert.equal(dropped, null, "an anonymous pin is not a hospital");
  });

  it("drops a record with no coordinates", () => {
    const dropped = normalizeElement({
      type: "way",
      id: 9,
      tags: { amenity: "hospital", name: "No Coordinates Hospital" },
    });
    assert.equal(dropped, null);
  });

  it("classifies a blood service from its own tags", () => {
    const record = normalizeElement({
      type: "node",
      id: 1,
      lat: 1,
      lon: 1,
      tags: { amenity: "blood_bank", name: "Red Cross Blood Bank" },
    });
    assert.equal(record.kind, "blood_bank");
  });

  it("reads the representative coordinate Overpass gives a way", () => {
    const record = normalizeElement({
      type: "way",
      id: 2,
      center: { lat: 25.5, lon: 85.2 },
      tags: { amenity: "hospital", name: "Way Hospital" },
    });
    assert.equal(record.latitude, 25.5);
    assert.equal(record.longitude, 85.2);
  });
});

describe("facility de-duplication (§5)", () => {
  it("collapses a node/way pair for the same place and fills a missing field", () => {
    const node = normalizeElement({
      type: "node",
      id: 1,
      lat: 25.6,
      lon: 85.1,
      tags: { amenity: "hospital", name: "City Hospital" },
    });
    const way = normalizeElement({
      type: "way",
      id: 2,
      center: { lat: 25.6, lon: 85.1 },
      tags: { amenity: "hospital", name: "city hospital", phone: "+91 999" },
    });

    const unique = dedupeFacilities([node, way]);
    assert.equal(unique.length, 1);
    assert.equal(unique[0].phone, "+91 999", "a duplicate may only contribute a missing field");
  });

  it("never overwrites a real value with null", () => {
    const first = normalizeElement({
      type: "node",
      id: 1,
      lat: 25.6,
      lon: 85.1,
      tags: { amenity: "hospital", name: "X", phone: "+91 1" },
    });
    const second = normalizeElement({
      type: "way",
      id: 2,
      center: { lat: 25.6, lon: 85.1 },
      tags: { amenity: "hospital", name: "X" },
    });

    const unique = dedupeFacilities([first, second]);
    assert.equal(unique[0].phone, "+91 1");
  });
});

describe("distance and ordering (§2)", () => {
  it("measures zero for the same point and a real distance otherwise", () => {
    assert.equal(Math.round(distanceMeters(25.5941, 85.1376, 25.5941, 85.1376)), 0);
    // 0.0164° of latitude is roughly 1.8 km.
    const metres = distanceMeters(25.5941, 85.1376, 25.6105, 85.1376);
    assert.ok(metres > 1700 && metres < 1900, `expected ~1.8 km, got ${metres}`);
  });

  it("filters by kind and sorts by real distance, nearest first", () => {
    const near = normalizeElement({
      type: "node", id: 1, lat: 25.5951, lon: 85.1376,
      tags: { amenity: "hospital", name: "Near" },
    });
    const far = normalizeElement({
      type: "node", id: 2, lat: 25.6941, lon: 85.1376,
      tags: { amenity: "hospital", name: "Far" },
    });
    const clinic = normalizeElement({
      type: "node", id: 3, lat: 25.5945, lon: 85.1376,
      tags: { amenity: "clinic", name: "Clinic" },
    });

    const ordered = filterAndSort([far, clinic, near], {
      latitude: 25.5941,
      longitude: 85.1376,
      types: ["hospital"],
      sortBy: "distance",
    });

    assert.deepEqual(ordered.map((record) => record.name), ["Near", "Far"]);
    assert.ok(ordered[0].distanceMeters < ordered[1].distanceMeters);
  });
});

describe("searchFacilities provider contract (§1, §3, §5)", () => {
  it("returns real records with attribution and a retrieval time — never a stock figure", async () => {
    stubFetch(() =>
      jsonResponse({
        elements: [
          { type: "node", id: 10, lat: 25.61, lon: 85.14, tags: { amenity: "hospital", name: "Real Hospital", phone: "+91 612" } },
          { type: "node", id: 11, lat: 25.612, lon: 85.141, tags: { amenity: "blood_bank", name: "Real Blood Bank" } },
          // Dropped: neither a name nor an address.
          { type: "node", id: 12, lat: 25.613, lon: 85.142, tags: { amenity: "hospital" } },
        ],
      }),
    );

    const result = await searchFacilities({ latitude: 25.5941, longitude: 85.1376, radiusMeters: 10_000, limit: 10 });

    assert.equal(result.facilities.length, 2);
    assert.equal(result.attribution.text, OSM_ATTRIBUTION.text);
    assert.equal(result.sources.directory, OSM_SOURCES.directory);
    assert.ok(Number.isFinite(new Date(result.fetchedAt).getTime()));

    for (const facility of result.facilities) {
      assert.equal("availableQuantity" in facility, false);
      assert.equal("bloodGroup" in facility, false);
    }

    assert.match(calls[0].url, /overpass/i);
    assert.equal(calls[0].init.method, "POST");
    assert.ok(String(calls[0].init.body).includes("data="), "the Overpass query is sent as a form body");
  });

  it("restricts results to the requested kinds", async () => {
    stubFetch(() =>
      jsonResponse({
        elements: [
          { type: "node", id: 20, lat: 25.61, lon: 85.14, tags: { amenity: "hospital", name: "H" } },
          { type: "node", id: 21, lat: 25.611, lon: 85.141, tags: { amenity: "blood_bank", name: "BB" } },
        ],
      }),
    );

    const result = await searchFacilities({ latitude: 25.6, longitude: 85.14, radiusMeters: 5_000, types: ["blood_bank"] });
    assert.equal(result.facilities.length, 1);
    assert.equal(result.facilities[0].kind, "blood_bank");
  });

  it("rejects a coordinate outside the valid range", async () => {
    await assert.rejects(
      () => searchFacilities({ latitude: 999, longitude: 85 }),
      /outside the valid range/i,
    );
  });

  it("retries a busy Overpass instance instead of returning an empty list", async () => {
    let attempt = 0;
    stubFetch(() => {
      attempt += 1;
      // What a public Overpass instance returns while every query worker is
      // busy. Treating this as final is what leaves the panel blank.
      if (attempt === 1) return jsonResponse({ remark: "runtime error" }, 502);
      return jsonResponse({
        elements: [
          { type: "node", id: 30, lat: 25.61, lon: 85.14, tags: { amenity: "blood_bank", name: "Recovered Blood Bank" } },
        ],
      });
    });

    const result = await searchFacilities({ latitude: 25.6, longitude: 85.14, radiusMeters: 5_000 });

    assert.equal(calls.length, 2, "a 502 is retried once before the search is given up");
    assert.equal(result.facilities.length, 1);
    assert.equal(result.facilities[0].name, "Recovered Blood Bank");
  });

  it("gives up honestly when Overpass stays at capacity, within a bounded number of attempts", async () => {
    stubFetch(() => jsonResponse({ remark: "runtime error" }, 502));

    const error = await searchFacilities({ latitude: 25.6, longitude: 85.14, radiusMeters: 5_000 })
      .then(() => null)
      .catch((thrown) => thrown);

    assert.ok(error, "a directory that never recovers must not resolve");
    assert.equal(error.code, "DIRECTORY_BUSY");
    assert.equal(calls.length, 3, "the retry loop is bounded, never a hot loop");
  });
});

describe("geocodePlace provider contract (§2)", () => {
  it("returns real coordinates with an identifying User-Agent, never a browser UA", async () => {
    stubFetch(() => jsonResponse([{ lat: "25.5941", lon: "85.1376", display_name: "Patna, Bihar, India" }]));

    const place = await geocodePlace("Patna");
    assert.equal(place.latitude, 25.5941);
    assert.equal(place.longitude, 85.1376);
    assert.equal(place.source, OSM_SOURCES.geocoder);

    const { url, init } = calls[0];
    assert.match(url, /nominatim/i);
    assert.match(url, /format=jsonv2/);
    assert.ok(init.headers["User-Agent"], "Nominatim requires an identifying User-Agent");
    assert.doesNotMatch(init.headers["User-Agent"], /Mozilla/);
  });

  it("returns null rather than inventing a place when nothing matches", async () => {
    stubFetch(() => jsonResponse([]));
    assert.equal(await geocodePlace("Zzzznowhere"), null);
  });
});
