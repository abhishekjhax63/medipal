/**
 * §11 / §12 / §13 / §16 / §17 / §20 / §27 — the live-availability HTTP surface.
 *
 * These tests drive `handleLiveBloodRoute` with request/response doubles, so
 * the routing, validation, freshness labelling and authorization can be checked
 * without opening a socket.
 *
 * The one committed fixture (see tests/helpers/db.mjs) is a labelled synthetic
 * centre carrying two figures: a 2-minute-old one that must read LIVE and a
 * 9-hour-old one that must read OUTDATED. It is deleted when the run finishes.
 */

import "./../helpers/env.mjs";

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { handleLiveBloodRoute, AVAILABILITY_DISCLAIMER } from "../../server/blood/live-routes.mjs";
import { sendError } from "../../server/http.mjs";
import { config } from "../../server/env.mjs";
import { closePool, dbConfigured } from "../../server/db.mjs";
import {
  createBareCentre,
  createFixture,
  removeFixture,
  removeSyncRun,
  FIXTURE_PREFIX,
} from "../helpers/db.mjs";
import { fakeRequest, fakeResponse, jsonBody, urlOf } from "../helpers/http.mjs";

const NO_DATABASE = "DATABASE_URL is not configured — the live-route suite needs a database.";
const ADMIN_KEY = config.blood.adminKey;

/**
 * Drives one route. An `HttpError` is turned into the same JSON error response
 * `server/index.mjs` would produce, so a test can assert on the status the
 * client actually receives.
 */
async function call(method, path, headers = {}) {
  const request = fakeRequest({ method, headers });
  const response = fakeResponse();
  try {
    const handled = await handleLiveBloodRoute(request, response, urlOf(path));
    return { handled, request, response, error: null };
  } catch (error) {
    sendError(response, error);
    return { handled: true, request, response, error };
  }
}

describe("live blood routes", { skip: dbConfigured ? false : NO_DATABASE }, () => {
  let fixture = null;
  let bareCentre = null;

  before(async () => {
    fixture = await createFixture();
    bareCentre = await createBareCentre();
  });

  after(async () => {
    await removeFixture(fixture);
    await removeFixture(bareCentre);
    await closePool();
  });

  describe("GET /api/blood/districts (§11)", () => {
    it("returns the 38 Bihar districts with a headquarters coordinate", async () => {
      const { response } = await call("GET", "/api/blood/districts");
      assert.equal(response.statusCode, 200);
      const body = jsonBody(response);
      assert.equal(body.state, "Bihar");
      assert.equal(body.count, 38);
      const patna = body.districts.find((district) => district.name === "Patna");
      assert.deepEqual(patna.centre, [25.5941, 85.1376]);
    });
  });

  describe("GET /api/blood/centres (§11, §15)", () => {
    it("age-labels each figure from the source's own observation time", async () => {
      const { response } = await call("GET", "/api/blood/centres?district=Patna");
      assert.equal(response.statusCode, 200);
      const rows = jsonBody(response).results.filter((row) => row.centreId === fixture.facilityId);
      assert.equal(rows.length, 2);

      const platelets = rows.find((row) => row.component === "Platelets");
      const wholeBlood = rows.find((row) => row.component === "Whole Blood");
      assert.equal(platelets.freshness, "LIVE", "a 2-minute-old observation is LIVE");
      assert.equal(wholeBlood.freshness, "OUTDATED", "a 9-hour-old observation is never LIVE");
      assert.equal(wholeBlood.availabilityStatus, "LOW");
    });

    it("carries provenance and the confirmation disclaimer on every result (§15, §28)", async () => {
      const { response } = await call("GET", "/api/blood/centres?district=Patna");
      const body = jsonBody(response);
      assert.equal(body.disclaimer, AVAILABILITY_DISCLAIMER);
      assert.ok(body.results.length > 0);
      for (const row of body.results) {
        assert.equal(row.disclaimer, AVAILABILITY_DISCLAIMER);
        assert.ok(row.source.id, "every row names its source");
        assert.ok(row.source.label, "the source has a human label");
        assert.ok(row.lastUpdatedAt, "every row is dated");
      }
      // No provider secret may ever be part of a public payload.
      assert.ok(!response.body.includes(ADMIN_KEY));
    });

    it("rejects an unknown blood group instead of silently ignoring it (§11)", async () => {
      const { response } = await call("GET", "/api/blood/centres?bloodGroup=AB");
      assert.equal(response.statusCode, 400);
      assert.equal(jsonBody(response).code, "VALIDATION");
    });

    it("rejects an unknown component", async () => {
      const { response } = await call("GET", "/api/blood/centres?component=Unobtainium");
      assert.equal(response.statusCode, 400);
      assert.equal(jsonBody(response).code, "VALIDATION");
    });
  });

  describe("GET /api/blood/nearby (§12, §16)", () => {
    it("declines a coordinate-less request so the directory lookup can answer", async () => {
      const { handled } = await call("GET", "/api/blood/nearby?q=Patna");
      assert.equal(handled, false);
    });

    it("returns centres around a coordinate, nearest first", async () => {
      const { response } = await call(
        "GET",
        "/api/blood/nearby?latitude=25.5941&longitude=85.1376&radius=25",
      );
      assert.equal(response.statusCode, 200);
      const body = jsonBody(response);
      assert.equal(body.origin.latitude, 25.5941);
      assert.equal(body.disclaimer, AVAILABILITY_DISCLAIMER);
      const mine = body.results.filter((row) => row.centreId === fixture.facilityId);
      assert.ok(mine.length > 0, "the fixture centre is inside the radius");
      assert.equal(mine[0].distanceKm, 0);
      // Confirmed stock must sort above anything unconfirmed.
      const ranks = body.results.map((row) => (row.freshness === "LIVE" ? 0 : 1));
      assert.deepEqual([...ranks].sort((a, b) => a - b), ranks, "results are emergency-ranked");
    });
  });

  describe("GET /api/blood/facilities/cards (§1, §4)", () => {
    const CARDS = "/api/blood/facilities/cards?state=Bihar&district=Patna&limit=200";

    it("returns one card per approved centre with its reported stock nested", async () => {
      const { response } = await call("GET", CARDS);
      assert.equal(response.statusCode, 200);
      const body = jsonBody(response);
      assert.equal(body.disclaimer, AVAILABILITY_DISCLAIMER);
      assert.ok(!response.body.includes(ADMIN_KEY), "no credential in a public payload");

      const mine = body.cards.find((card) => card.centreId === fixture.facilityId);
      assert.ok(mine, "the fixture centre is listed");
      assert.equal(mine.availabilityState, "reported");
      assert.equal(mine.inventory.reported, true);
      assert.equal(mine.inventory.lineCount, 2);
    });

    it("age-labels each nested line from the source's own observation time (§1)", async () => {
      const { response } = await call("GET", CARDS);
      const card = jsonBody(response).cards.find((row) => row.centreId === fixture.facilityId);
      const platelets = card.inventory.lines.find((line) => line.component === "Platelets");
      const wholeBlood = card.inventory.lines.find((line) => line.component === "Whole Blood");
      assert.equal(platelets.freshness, "LIVE", "a 2-minute-old observation is LIVE");
      assert.equal(wholeBlood.freshness, "OUTDATED", "a 9-hour-old observation is never LIVE");
      assert.equal(wholeBlood.availabilityStatus, "LOW");
      assert.equal(wholeBlood.units, 3);
    });

    it("reports a centre that has reported nothing as not_reported, never as zero (§1)", async () => {
      const { response } = await call("GET", CARDS);
      const card = jsonBody(response).cards.find((row) => row.centreId === bareCentre.facilityId);
      assert.ok(card, "a centre with no report is still listed");
      assert.equal(card.availabilityState, "not_reported");
      assert.equal(card.inventory.reported, false);
      assert.equal(card.inventory.lineCount, 0);
      assert.deepEqual(card.inventory.lines, [], "no figure is invented for it");
      assert.equal(card.verification, "unverified", "the raw enum, never upgraded by the API");
    });

    it("treats a group filter as a search, dropping centres with no report for it", async () => {
      const matching = await call(
        "GET",
        "/api/blood/facilities/cards?state=Bihar&district=Patna&bloodGroup=O%2B&limit=200",
      );
      const ids = jsonBody(matching.response).cards.map((card) => card.centreId);
      assert.ok(ids.includes(fixture.facilityId), "a centre reporting O+ is a match");
      assert.ok(!ids.includes(bareCentre.facilityId), "a centre with no report is not");

      const none = await call(
        "GET",
        "/api/blood/facilities/cards?state=Bihar&district=Patna&bloodGroup=B-&limit=200",
      );
      assert.ok(
        !jsonBody(none.response).cards.some((card) => card.centreId === fixture.facilityId),
        "a centre that never reported B- is not shown as if it held none",
      );
    });

    it("rejects an unknown blood group instead of silently ignoring it (§11)", async () => {
      const { response } = await call("GET", "/api/blood/facilities/cards?bloodGroup=AB");
      assert.equal(response.statusCode, 400);
      assert.equal(jsonBody(response).code, "VALIDATION");
    });
  });

  describe("GET /api/blood/facilities/:reference/inventory (§1, §2, §3)", () => {
    it("returns the centre's own reported figures with provenance", async () => {
      const { response } = await call("GET", `/api/blood/facilities/${fixture.facilityRef}/inventory`);
      assert.equal(response.statusCode, 200);
      const body = jsonBody(response);
      assert.equal(body.facility.reference, fixture.facilityRef);
      assert.equal(body.facility.centreId, fixture.facilityId);
      assert.equal(body.facility.inventory.lineCount, 2);
      assert.equal(body.disclaimer, AVAILABILITY_DISCLAIMER);
      assert.ok(body.facility.source.id, "the panel names its source");
      assert.ok(!response.body.includes(ADMIN_KEY));
    });

    it("still resolves a centre that has reported nothing, with an empty panel", async () => {
      const { response } = await call(
        "GET",
        `/api/blood/facilities/${bareCentre.facilityRef}/inventory`,
      );
      assert.equal(response.statusCode, 200);
      const body = jsonBody(response);
      assert.equal(body.facility.availabilityState, "not_reported");
      assert.equal(body.facility.inventory.lineCount, 0);
    });

    it("404s an unknown reference rather than inventing a centre (§1)", async () => {
      const { response } = await call("GET", "/api/blood/facilities/MED-BBF-DOES-NOT-EXIST/inventory");
      assert.equal(response.statusCode, 404);
      assert.equal(jsonBody(response).code, "FACILITY_NOT_FOUND");
    });
  });

  describe("GET /api/blood/health (§25, §20)", () => {
    it("reports the unconfigured source honestly and never leaks a credential", async () => {
      const { response } = await call("GET", "/api/blood/health");
      assert.equal(response.statusCode, 200);
      const body = jsonBody(response);
      const eraktkosh = body.sources.find((source) => source.id === "eraktkosh_authorized_feed");
      assert.equal(eraktkosh.configured, false);
      assert.equal(eraktkosh.health, "not_configured");
      assert.equal(eraktkosh.baseUrlConfigured, false);
      assert.ok(!response.body.includes(ADMIN_KEY));
      assert.ok(!/bearer/i.test(response.body), "no auth scheme may appear in a public payload");
    });
  });

  describe("platform admin authorization (§17, §20, §27)", () => {
    it("refuses the admin overview without a key", async () => {
      const { response } = await call("GET", "/api/blood/admin/blood-data");
      assert.equal(response.statusCode, 401);
      assert.equal(jsonBody(response).code, "UNAUTHENTICATED");
    });

    it("refuses the admin overview with a wrong key", async () => {
      const { response } = await call("GET", "/api/blood/admin/blood-data", {
        "x-medipal-admin-key": "definitely-not-the-key",
      });
      assert.equal(response.statusCode, 401);
    });

    it("serves the admin overview with the configured key", async () => {
      const { response } = await call("GET", "/api/blood/admin/blood-data", {
        "x-medipal-admin-key": ADMIN_KEY,
      });
      assert.equal(response.statusCode, 200);
      const body = jsonBody(response);
      assert.ok(body.overview.centres.total >= 1);
      assert.ok(body.scheduler, "the scheduler state is included");
      assert.ok(Array.isArray(body.health.sources));
    });

    it("protects the sync log with the same key", async () => {
      const unauthorised = await call("GET", "/api/blood/admin/sync-runs");
      assert.equal(unauthorised.response.statusCode, 401);

      const authorised = await call("GET", "/api/blood/admin/sync-runs", {
        "x-medipal-admin-key": ADMIN_KEY,
      });
      assert.equal(authorised.response.statusCode, 200);
      assert.ok(Array.isArray(jsonBody(authorised.response).runs));
    });

    it("requires a named source for a manual sync", async () => {
      const { response } = await call("POST", "/api/blood/admin/sync/run", {
        "x-medipal-admin-key": ADMIN_KEY,
      });
      assert.equal(response.statusCode, 400);
      assert.equal(jsonBody(response).code, "VALIDATION");
    });

    it("skips a disabled source instead of inventing a fetch", async () => {
      const { response } = await call(
        "POST",
        "/api/blood/admin/sync/run?provider=eraktkosh_authorized_feed",
        { "x-medipal-admin-key": ADMIN_KEY },
      );
      assert.equal(response.statusCode, 200);
      const body = jsonBody(response);
      assert.equal(body.status, "skipped");
      assert.equal(body.records.received, 0);
      await removeSyncRun(body.runId);
    });

    it("does not claim an unknown admin route", async () => {
      const { handled } = await call("GET", "/api/blood/admin/nonexistent", {
        "x-medipal-admin-key": ADMIN_KEY,
      });
      assert.equal(handled, false);
    });
  });

  describe("GET /api/blood/stream (§13)", () => {
    it("opens an SSE stream and cleans up when the client disconnects", async () => {
      const request = fakeRequest({ method: "GET" });
      const response = fakeResponse();
      const handled = await handleLiveBloodRoute(request, response, urlOf("/api/blood/stream"));
      assert.equal(handled, true);
      assert.equal(response.statusCode, 200);
      assert.match(response.headers["Content-Type"], /text\/event-stream/);
      assert.match(response.body, /retry: 5000/);
      // The `hello` frame tells a client it is connected before any change.
      assert.match(response.body, /"type":"hello"/);
      // Required, or the keep-alive interval keeps the test run alive.
      request.emit("close");
    });
  });

  describe("synthetic fixture hygiene", () => {
    it("uses a marker that is obviously not real data", () => {
      assert.ok(fixture.marker.startsWith(FIXTURE_PREFIX));
    });
  });
});
