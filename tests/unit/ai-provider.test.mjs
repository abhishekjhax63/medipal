/**
 * AI provider resolution.
 *
 * Proves the Gemini convenience wiring without ever holding a credential: the
 * value below is an obvious placeholder, and no network request is made. Two
 * separate module instances are imported so each case sees its own
 * environment — `server/env.mjs` reads `process.env` exactly once, at load.
 *
 * The values are assigned rather than deleted because `server/env.mjs` falls
 * back to `.env.server` for any key that is still `undefined`, and a
 * developer's local `.env.server` must not change the outcome of a test.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const PLACEHOLDER_KEY = "test-placeholder-not-a-credential";

process.env.GEMINI_API_KEY = PLACEHOLDER_KEY;
process.env.AI_BASE_URL = "";
process.env.AI_API_KEY = "";
process.env.AI_MODEL = "";

const gemini = await import("../../server/env.mjs");

process.env.AI_BASE_URL = "https://gateway.example/v1";
process.env.AI_API_KEY = PLACEHOLDER_KEY;
process.env.AI_MODEL = "vendor/model";

const explicit = await import("../../server/env.mjs?explicit");

describe("AI provider resolution", () => {
  it("derives Gemini's documented OpenAI-compatible endpoint from the key alone", () => {
    assert.equal(
      gemini.config.ai.baseUrl,
      "https://generativelanguage.googleapis.com/v1beta/openai",
    );
    assert.equal(gemini.config.ai.provider, "gemini");
    assert.equal(gemini.config.ai.apiKey, PLACEHOLDER_KEY);
    assert.ok(gemini.config.ai.model, "a default model keeps the provider ready");
    assert.equal(gemini.readiness.ai, true);
  });

  it("never assumes vision support from the model name", () => {
    assert.equal(gemini.config.ai.supportsImages, false);
    assert.equal(gemini.config.ai.supportsVideoFrames, false);
  });

  it("lets an explicit AI_BASE_URL override the Gemini default", () => {
    assert.equal(explicit.config.ai.baseUrl, "https://gateway.example/v1");
    assert.equal(explicit.config.ai.provider, "openai-compatible");
    assert.equal(explicit.config.ai.model, "vendor/model");
  });
});
