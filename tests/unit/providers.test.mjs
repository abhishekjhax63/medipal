/**
 * §2 / §3 / §19 / §22 / §27 — provider adapters, the retry policy, and the
 * "not configured" contract.
 *
 * The most important tests here are the negative ones. An unconfigured
 * e-RaktKosh adapter must report `not_configured` and must make NO network
 * request at all — a health probe that reached out to a government system
 * without credentials would be exactly the unauthorised access §2 forbids.
 *
 * `tests/helpers/env.mjs` blanks every `ERAKTKOSH_*` value on purpose, so the
 * suite can never accidentally exercise a real credential.
 */

import "./../helpers/env.mjs";

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

import { PROVIDER_CODES, ProviderError, fetchJsonWithRetry, pickRecordArray } from "../../server/blood/providers/base.mjs";
import { ERaktKoshProvider } from "../../server/blood/providers/eraktkosh.mjs";
import { getRunnableProviders, invalidateProviderCache } from "../../server/blood/providers/index.mjs";
import { closePool } from "../../server/db.mjs";

// `loadProviders()` may open a pooled connection; release it so the test
// process exits promptly instead of waiting on an idle socket.
after(async () => {
  await closePool();
});

/** A minimal Response double. Only the members the helper reads. */
function responseLike({ status = 200, body = "{}", headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    text: async () => body,
  };
}

/** Installs a scripted `fetch` and restores the real one afterwards. */
function withFetch(script, run) {
  const original = globalThis.fetch;
  const calls = [];
  let index = 0;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const step = typeof script === "function" ? script(index, url, options) : script[index];
    index += 1;
    if (step instanceof Error) throw step;
    if (typeof step === "function") return step();
    return step ?? responseLike();
  };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.fetch = original;
    })
    .then((result) => ({ result, calls }));
}

describe("e-RaktKosh adapter — unconfigured contract (§2, §3)", () => {
  it("isConfigured() is false when no credentials were issued", () => {
    assert.equal(new ERaktKoshProvider().isConfigured(), false);
  });

  it("healthCheck() reports not_configured WITHOUT touching the network", async () => {
    const original = globalThis.fetch;
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      throw new Error("A health probe must not reach a government system without credentials.");
    };
    try {
      const health = await new ERaktKoshProvider().healthCheck();
      assert.equal(health.status, "not_configured");
      assert.equal(attempts, 0, "healthyCheck() must not perform any request while unconfigured");
      assert.match(health.message, /e-RaktKosh/i);
      assert.ok(typeof health.checkedAt === "string");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("describe() exposes configuration state but never a credential", () => {
    const described = new ERaktKoshProvider().describe();
    assert.equal(described.configured, false);
    assert.equal(described.id, "eraktkosh_authorized_feed");
    // No key, secret, token or URL may leak into a client-facing description.
    assert.deepEqual(Object.keys(described).sort(), ["configured", "enabled", "id", "label", "priority"]);
  });

  it("refuses to fetch centres rather than inventing a path or an empty success", async () => {
    const error = await new ERaktKoshProvider().fetchBloodCentres().then(
      () => null,
      (caught) => caught,
    );
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, PROVIDER_CODES.NOT_CONFIGURED);
  });

  it("refuses to build an endpoint without an authorised base URL", () => {
    assert.throws(
      () => new ERaktKoshProvider().endpoint("/centres"),
      (error) => error.code === PROVIDER_CODES.NOT_CONFIGURED,
    );
  });
});

describe("bounded retry with backoff (§19)", () => {
  it("returns the payload on the first successful attempt", async () => {
    const { result, calls } = await withFetch(
      [responseLike({ status: 200, body: JSON.stringify({ centres: [{ id: "1" }] }) })],
      () => fetchJsonWithRetry("https://example.test/centres"),
    );
    assert.equal(calls.length, 1);
    assert.equal(result.attempts, 1);
    assert.deepEqual(result.payload, { centres: [{ id: "1" }] });
  });

  it("retries a 5xx and succeeds on the next attempt", async () => {
    const { result, calls } = await withFetch(
      [
        responseLike({ status: 503, body: "upstream down" }),
        responseLike({ status: 200, body: JSON.stringify({ ok: true }) }),
      ],
      () => fetchJsonWithRetry("https://example.test/centres"),
    );
    assert.equal(calls.length, 2);
    assert.equal(result.attempts, 2);
    assert.deepEqual(result.payload, { ok: true });
  });

  it("gives up after the configured number of attempts", async () => {
    const { calls } = await withFetch(
      () => responseLike({ status: 500, body: "boom" }),
      async () => {
        const error = await fetchJsonWithRetry("https://example.test/centres").then(
          () => null,
          (caught) => caught,
        );
        assert.equal(error.code, PROVIDER_CODES.BAD_RESPONSE);
      },
    );
    assert.equal(calls.length, 3, "BLOOD_PROVIDER_ATTEMPTS is pinned to 3 for the suite");
  });

  it("respects Retry-After on a 429 instead of hammering the endpoint", async () => {
    const { result, calls } = await withFetch(
      [
        responseLike({ status: 429, body: "slow down", headers: { "retry-after": "0" } }),
        responseLike({ status: 200, body: JSON.stringify({ availability: [] }) }),
      ],
      () => fetchJsonWithRetry("https://example.test/availability"),
    );
    assert.equal(calls.length, 2);
    assert.equal(result.attempts, 2);
  });

  it("does not retry an authentication failure", async () => {
    const { calls } = await withFetch(
      () => responseLike({ status: 401, body: "unauthorised" }),
      async () => {
        const error = await fetchJsonWithRetry("https://example.test/centres").then(
          () => null,
          (caught) => caught,
        );
        assert.equal(error.code, PROVIDER_CODES.AUTH);
      },
    );
    assert.equal(calls.length, 1, "a bad key stays bad — retrying it wastes the provider's quota");
  });

  it("rejects a body that is not JSON", async () => {
    const { result } = await withFetch(
      [responseLike({ status: 200, body: "<html>gateway</html>" })],
      () =>
        fetchJsonWithRetry("https://example.test/centres").then(
          () => null,
          (caught) => caught,
        ),
    );
    assert.equal(result.code, PROVIDER_CODES.BAD_RESPONSE);
  });

  it("maps a transport failure onto a retryable network error", async () => {
    const { calls } = await withFetch(
      () => Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
      async () => {
        const error = await fetchJsonWithRetry("https://example.test/centres").then(
          () => null,
          (caught) => caught,
        );
        assert.equal(error.code, PROVIDER_CODES.NETWORK);
      },
    );
    assert.equal(calls.length, 3);
  });

  it("maps an aborted request onto a timeout error", async () => {
    const { result } = await withFetch(
      () => Object.assign(new Error("aborted"), { name: "AbortError" }),
      () =>
        fetchJsonWithRetry("https://example.test/centres").then(
          () => null,
          (caught) => caught,
        ),
    );
    assert.equal(result.code, PROVIDER_CODES.TIMEOUT);
  });
});

describe("envelope discovery (§8)", () => {
  it("accepts a bare array", () => {
    assert.deepEqual(pickRecordArray([1, 2], ["data"]), [1, 2]);
  });

  it("finds rows under a known envelope key", () => {
    assert.deepEqual(pickRecordArray({ results: [{ id: 1 }] }, ["data", "results"]), [{ id: 1 }]);
  });

  it("returns null for an unrecognised shape instead of guessing", () => {
    assert.equal(pickRecordArray({ payload: [] }, ["data", "results"]), null);
    assert.equal(pickRecordArray("nonsense", ["data"]), null);
    assert.equal(pickRecordArray(null, ["data"]), null);
  });
});

describe("runnable provider selection (§3, §22)", () => {
  it("excludes switched-off and push-style sources from a scheduled pull", async () => {
    invalidateProviderCache();
    const runnable = await getRunnableProviders();
    const ids = runnable.map((provider) => provider.id);
    // e-RaktKosh is enabled=false by default and unconfigured in the test env.
    assert.ok(!ids.includes("eraktkosh_authorized_feed"));
    // The verified-centre source is push-style: the portal authors those rows.
    assert.ok(!ids.includes("blood_centre_verified"));
  });
});
