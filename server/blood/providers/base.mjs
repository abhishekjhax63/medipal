/**
 * The provider adapter contract.
 *
 * Every blood-availability source MEDIPAL can read from — an authorised
 * e-RaktKosh feed today, other authorised feeds later — implements this exact
 * interface. The sync pipeline only ever talks to this interface, so adding a
 * source is a matter of writing one adapter, not of touching the scheduler,
 * the database writer or the API.
 *
 * CREDENTIAL RULE: an adapter reads its credentials from `server/env.mjs`
 * (which reads `.env.server`, git-ignored). It never receives them from, and
 * never exposes them to, the browser. `describe()` deliberately reports only
 * whether a source is configured, never any part of a key.
 */

import { config } from "../../env.mjs";

/** Raised when a provider cannot be read. Carries a machine-readable code. */
export class ProviderError extends Error {
  constructor(message, code = "PROVIDER_ERROR", { retryable = false, cause = undefined } = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
  }
}

export const PROVIDER_CODES = Object.freeze({
  NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  NETWORK: "PROVIDER_NETWORK_ERROR",
  TIMEOUT: "PROVIDER_TIMEOUT",
  AUTH: "PROVIDER_AUTH_FAILED",
  RATE_LIMITED: "PROVIDER_RATE_LIMITED",
  BAD_RESPONSE: "PROVIDER_BAD_RESPONSE",
  UNSUPPORTED: "PROVIDER_UNSUPPORTED",
});

/**
 * The base class. Subclasses override the `fetch*` methods; anything they do
 * not support throws `PROVIDER_UNSUPPORTED` rather than returning a fabricated
 * empty result, so a caller can always tell "nothing to read" apart from
 * "cannot read".
 */
export class BloodDataProvider {
  /** @param {{ id: string, label: string, priority: number, enabled?: boolean }} meta */
  constructor(meta) {
    this.id = meta.id;
    this.label = meta.label;
    this.priority = meta.priority ?? 100;
    /** Whether the operator has switched this source on in the register. */
    this.enabled = meta.enabled ?? false;
  }

  /** True only when every credential this adapter needs has been supplied. */
  isConfigured() {
    return false;
  }

  /**
   * A credential-free description of the source for the API and the health
   * endpoint. This is the ONLY thing about a provider that may be serialised
   * to a client.
   */
  describe() {
    return {
      id: this.id,
      label: this.label,
      priority: this.priority,
      enabled: this.enabled,
      configured: this.isConfigured(),
    };
  }

  /** @returns {Promise<{ status: string, message: string, checkedAt: string }>} */
  async healthCheck() {
    return {
      status: this.isConfigured() ? "unknown" : "not_configured",
      message: this.isConfigured()
        ? "This source has not been probed yet."
        : "This source is missing the credentials MEDIPAL needs. Nothing is read from it.",
      checkedAt: new Date().toISOString(),
    };
  }

  /** @returns {Promise<string[]>} canonical district names the source covers. */
  async fetchDistricts() {
    throw new ProviderError(`${this.label} does not publish a district list.`, PROVIDER_CODES.UNSUPPORTED);
  }

  /** @returns {Promise<{ records: object[], warnings: string[] }>} */
  async fetchBloodCentres() {
    throw new ProviderError(`${this.label} does not publish blood centres.`, PROVIDER_CODES.UNSUPPORTED);
  }

  /** @returns {Promise<{ records: object[], warnings: string[] }>} */
  async fetchAvailability() {
    throw new ProviderError(`${this.label} does not publish availability.`, PROVIDER_CODES.UNSUPPORTED);
  }

  /** @returns {Promise<string|null>} ISO timestamp of the source's own last update. */
  async fetchLastUpdated() {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared HTTP helper with bounded retry + exponential backoff
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GETs JSON with a hard timeout and a bounded, backed-off retry loop.
 *
 * The retry policy is deliberately conservative and shared by every adapter:
 * `BLOOD_PROVIDER_ATTEMPTS` attempts, `BLOOD_PROVIDER_BACKOFF_MS` between them
 * (doubling each time). A 429 is respected via `Retry-After` — MEDIPAL never
 * hammers a public health endpoint.
 *
 * @returns {Promise<{ payload: unknown, attempts: number, latencyMs: number }>}
 */
export async function fetchJsonWithRetry(url, { headers = {}, signal = undefined } = {}) {
  const attemptsAllowed = config.blood.providerAttempts;
  const baseBackoff = config.blood.providerBackoffMs;
  const timeoutMs = config.blood.providerTimeoutMs;

  let lastError = null;
  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...headers },
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;

      if (response.status === 401 || response.status === 403) {
        throw new ProviderError(
          "The provider rejected MEDIPAL's credentials. Check the issued key and secret.",
          PROVIDER_CODES.AUTH,
        );
      }
      if (response.status === 429) {
        const retryAfter = Number.parseInt(response.headers.get("retry-after") || "", 10);
        lastError = new ProviderError(
          "The provider is rate limiting MEDIPAL. The next run will back off.",
          PROVIDER_CODES.RATE_LIMITED,
          { retryable: true },
        );
        const waitMs = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 30_000) : baseBackoff * 2 ** attempt;
        if (attempt < attemptsAllowed) {
          await sleep(waitMs);
          continue;
        }
        throw lastError;
      }
      if (!response.ok) {
        lastError = new ProviderError(
          `The provider replied with HTTP ${response.status}.`,
          PROVIDER_CODES.BAD_RESPONSE,
          { retryable: response.status >= 500 },
        );
        if (response.status >= 500 && attempt < attemptsAllowed) {
          await sleep(baseBackoff * 2 ** (attempt - 1));
          continue;
        }
        throw lastError;
      }

      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (error) {
        throw new ProviderError(
          "The provider returned a body that is not JSON.",
          PROVIDER_CODES.BAD_RESPONSE,
          { cause: error },
        );
      }
      return { payload, attempts: attempt, latencyMs };
    } catch (error) {
      if (error instanceof ProviderError) {
        if (!error.retryable || attempt >= attemptsAllowed) throw error;
        lastError = error;
      } else if (error?.name === "AbortError") {
        lastError = new ProviderError(
          `The provider did not respond within ${timeoutMs} ms.`,
          PROVIDER_CODES.TIMEOUT,
          { retryable: true },
        );
        if (attempt >= attemptsAllowed) throw lastError;
      } else {
        lastError = new ProviderError(
          "MEDIPAL could not reach the provider.",
          PROVIDER_CODES.NETWORK,
          { retryable: true, cause: error },
        );
        if (attempt >= attemptsAllowed) throw lastError;
      }
      await sleep(baseBackoff * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new ProviderError("The provider could not be read.", PROVIDER_CODES.NETWORK);
}

/**
 * Finds the array of records inside an unknown provider envelope. Real-world
 * feeds wrap their rows in one of a handful of keys; if none is present we
 * refuse the payload rather than guessing a shape and storing nonsense.
 */
export function pickRecordArray(payload, candidateKeys) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  for (const key of candidateKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return null;
}
