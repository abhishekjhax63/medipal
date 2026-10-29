/**
 * AI Doctor chat resilience.
 *
 * Two failure modes the browser must never see raw: a gateway that rate-limits
 * a burst of questions, and a model that returns its private reasoning instead
 * of an answer. `fetch` is stubbed in every case, so the suite never makes a
 * real — and potentially billable — provider call.
 *
 * `tests/helpers/env.mjs` is imported first and then overridden, because
 * `server/env.mjs` reads `process.env` exactly once, at load.
 */

import "../helpers/env.mjs";

import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

// A configured-but-unreachable provider: the base URL below is never used,
// because every test replaces `globalThis.fetch` before calling into the code.
process.env.AI_BASE_URL = "https://gateway.invalid/v1";
process.env.AI_API_KEY = "test-placeholder-not-a-credential";
process.env.AI_MODEL = "vendor/model";

const { requestChat } = await import("../../server/ai.mjs");

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

let calls = 0;
beforeEach(() => { calls = 0; });

/** A streaming response body that yields exactly the given SSE frames. */
function streamFrom(frames, { status = 200, headers = {} } = {}) {
  const encoder = new TextEncoder();
  const chunks = frames.map((frame) => encoder.encode(frame));
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    body: {
      getReader: () => ({
        read: async () => (index < chunks.length ? { done: false, value: chunks[index++] } : { done: true, value: undefined }),
        cancel: async () => undefined,
      }),
    },
    text: async () => "",
  };
}

function stubFetch(handler) {
  globalThis.fetch = async (...args) => {
    calls += 1;
    return handler(...args);
  };
}

/** Collects every streamed chunk so the final reply can be asserted. */
async function runChat() {
  const chunks = [];
  await requestChat([{ role: "user", content: "Explain an ECG to me" }], (chunk) => chunks.push(chunk));
  return { chunks, final: chunks[chunks.length - 1] };
}

describe("AI Doctor chat resilience", () => {
  it("keeps a model's private reasoning out of the visible answer", async () => {
    stubFetch(() => streamFrom([
      'data: {"choices":[{"delta":{"reasoning_content":"private scratchpad"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"An ECG records"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" heart rhythm."}}]}\n\n',
      "data: [DONE]\n\n",
    ]));

    const { final } = await runChat();

    assert.equal(final.done, true);
    assert.equal(final.reply, "An ECG records heart rhythm.");
    assert.ok(!final.reply.includes("private scratchpad"), "reasoning must never be rendered as advice");
  });

  it("says an answer was cut off instead of ending silently", async () => {
    stubFetch(() => streamFrom([
      'data: {"choices":[{"delta":{"content":"Start of an answer"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" that ran out"},"finish_reason":"length"}]}\n\n',
      "data: [DONE]\n\n",
    ]));

    const { final } = await runChat();

    assert.match(final.reply, /^Start of an answer that ran out/);
    assert.match(final.reply, /cut off/i);
  });

  it("reads a non-streamed JSON body rather than reporting an empty answer", async () => {
    stubFetch(() => streamFrom([
      '{"choices":[{"message":{"content":"A non-streamed answer."}}]}',
    ]));

    const { final } = await runChat();

    assert.equal(final.reply, "A non-streamed answer.");
    assert.equal(final.done, true);
  });

  it("retries a rate-limited burst and still answers", async () => {
    stubFetch((_url, options) => {
      assert.ok(options.signal, "every attempt must carry its own abort signal");
      return calls === 1
        ? streamFrom([], { status: 429, headers: { "retry-after": "1" } })
        : streamFrom([
            'data: {"choices":[{"delta":{"content":"Recovered."},"finish_reason":"stop"}]}\n\n',
            "data: [DONE]\n\n",
          ]);
    });

    const { final } = await runChat();

    assert.equal(calls, 2, "the first attempt must be retried once");
    assert.equal(final.reply, "Recovered.");
  });

  it("turns a sustained rate limit into an actionable message, not a provider status", async () => {
    const attempts = [];
    stubFetch(() => {
      attempts.push(new Date());
      return streamFrom([], { status: 429, headers: { "retry-after": "1" } });
    });

    await assert.rejects(
      () => runChat(),
      (error) => {
        assert.equal(error.code, "AI_BUSY");
        assert.match(error.message, /too many questions/i);
        assert.ok(!/\b429\b/.test(error.message), "a raw provider status must not reach the user");
        return true;
      },
    );

    assert.equal(calls, 3, "attempts are bounded");
    assert.ok(attempts[1] - attempts[0] >= 900, "the provider's Retry-After is honoured");
  });
});
