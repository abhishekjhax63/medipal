/**
 * ERaktKoshProvider — the adapter for the officially authorised e-RaktKosh
 * integration.
 *
 * WHAT THIS IS NOT: this is not a scraper. MEDIPAL does not, and must not,
 * bypass e-RaktKosh's authentication, reverse-engineer a private endpoint,
 * solve a CAPTCHA, evade a rate limit, or impersonate a licensed blood bank.
 * e-RaktKosh is operated by the Ministry of Health & Family Welfare / C-DAC and
 * issues API credentials only through a formal onboarding process.
 *
 * WHAT THIS IS: a complete, ready adapter. The moment an operator drops the
 * issued `ERAKTKOSH_API_BASE_URL`, `ERAKTKOSH_API_KEY`, `ERAKTKOSH_API_SECRET`
 * and the path names those credentials expect into `.env.server`, this class
 * starts returning real figures through the normal sync pipeline. Until then it
 * reports `not_configured` and reads nothing.
 *
 * No endpoint path is ever guessed. `ERAKTKOSH_CENTRES_PATH`,
 * `ERAKTKOSH_AVAILABILITY_PATH` and `ERAKTKOSH_DISTRICTS_PATH` must be supplied
 * by the operator, because inventing a path would be exactly the kind of
 * fabrication this system is built to avoid.
 */

import { config, readiness } from "../../env.mjs";
import {
  BloodDataProvider,
  ProviderError,
  PROVIDER_CODES,
  fetchJsonWithRetry,
  pickRecordArray,
} from "./base.mjs";

const CENTRE_ENVELOPE_KEYS = ["centres", "bloodCentres", "bloodBanks", "facilities", "data", "results", "records", "items"];
const AVAILABILITY_ENVELOPE_KEYS = ["availability", "inventory", "stock", "data", "results", "records", "items"];
const DISTRICT_ENVELOPE_KEYS = ["districts", "data", "results", "records", "items"];

export class ERaktKoshProvider extends BloodDataProvider {
  constructor(meta = {}) {
    super({
      id: meta.id ?? "eraktkosh_authorized_feed",
      label: meta.label ?? "e-RaktKosh authorised feed",
      priority: meta.priority ?? 10,
      enabled: meta.enabled ?? false,
    });
  }

  isConfigured() {
    return readiness.eraktkosh;
  }

  /** Builds the auth header exactly as the operator told us to. */
  authHeaders() {
    const value = config.eraktkosh.authScheme
      ? `${config.eraktkosh.authScheme} ${config.eraktkosh.apiKey}`
      : config.eraktkosh.apiKey;
    const headers = { [config.eraktkosh.authHeader]: value };
    // Some government gateways expect the paired secret too; supplied only when
    // the operator provided one, never invented.
    if (config.eraktkosh.apiSecret) headers["X-Api-Secret"] = config.eraktkosh.apiSecret;
    return headers;
  }

  /** Resolves a configured path against the authorised base URL. */
  endpoint(path) {
    const base = config.eraktkosh.baseUrl;
    if (!base) {
      throw new ProviderError(
        "ERAKTKOSH_API_BASE_URL has not been supplied. MEDIPAL will not guess an e-RaktKosh endpoint.",
        PROVIDER_CODES.NOT_CONFIGURED,
      );
    }
    const normalised = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalised}`;
  }

  requireConfigured() {
    if (!this.isConfigured()) {
      throw new ProviderError(
        "The e-RaktKosh authorised feed is not configured. C-DAC must issue credentials to this " +
          "deployment before MEDIPAL can read live figures from it. Nothing has been fabricated in the meantime.",
        PROVIDER_CODES.NOT_CONFIGURED,
      );
    }
  }

  /**
   * A real probe. When unconfigured it returns `not_configured` WITHOUT making
   * any network request — a probe must not become an unauthorised access
   * attempt against a government system.
   */
  async healthCheck() {
    const checkedAt = new Date().toISOString();
    if (!this.isConfigured()) {
      return {
        status: "not_configured",
        message:
          "Awaiting C-DAC–issued e-RaktKosh credentials. Set ERAKTKOSH_API_BASE_URL, " +
          "ERAKTKOSH_API_KEY, ERAKTKOSH_CENTRES_PATH and ERAKTKOSH_AVAILABILITY_PATH in `.env.server`.",
        checkedAt,
      };
    }
    try {
      const { latencyMs } = await fetchJsonWithRetry(this.endpoint(config.eraktkosh.centresPath), {
        headers: this.authHeaders(),
      });
      return { status: "healthy", message: `Responded in ${latencyMs} ms.`, checkedAt };
    } catch (error) {
      const status = error?.code === PROVIDER_CODES.AUTH ? "offline" : "degraded";
      return { status, message: error.message, checkedAt };
    }
  }

  async fetchDistricts() {
    this.requireConfigured();
    if (!config.eraktkosh.districtsPath) {
      throw new ProviderError(
        "ERAKTKOSH_DISTRICTS_PATH is not set, so district discovery is not available from this feed.",
        PROVIDER_CODES.UNSUPPORTED,
      );
    }
    const { payload } = await fetchJsonWithRetry(this.endpoint(config.eraktkosh.districtsPath), {
      headers: this.authHeaders(),
    });
    const rows = pickRecordArray(payload, DISTRICT_ENVELOPE_KEYS);
    if (!rows) {
      throw new ProviderError(
        "The districts endpoint returned an unrecognised envelope.",
        PROVIDER_CODES.BAD_RESPONSE,
      );
    }
    return rows
      .map((row) => (typeof row === "string" ? row : row?.name ?? row?.district ?? row?.districtName))
      .filter((name) => typeof name === "string" && name.trim().length > 0);
  }

  async fetchBloodCentres() {
    this.requireConfigured();
    const { payload, attempts } = await fetchJsonWithRetry(this.endpoint(config.eraktkosh.centresPath), {
      headers: this.authHeaders(),
    });
    const rows = pickRecordArray(payload, CENTRE_ENVELOPE_KEYS);
    if (!rows) {
      throw new ProviderError(
        "The centres endpoint returned an unrecognised envelope. MEDIPAL will not guess the shape.",
        PROVIDER_CODES.BAD_RESPONSE,
      );
    }
    return { records: rows, warnings: [], attempts };
  }

  async fetchAvailability() {
    this.requireConfigured();
    const { payload, attempts } = await fetchJsonWithRetry(this.endpoint(config.eraktkosh.availabilityPath), {
      headers: this.authHeaders(),
    });
    const rows = pickRecordArray(payload, AVAILABILITY_ENVELOPE_KEYS);
    if (!rows) {
      throw new ProviderError(
        "The availability endpoint returned an unrecognised envelope. MEDIPAL will not guess the shape.",
        PROVIDER_CODES.BAD_RESPONSE,
      );
    }
    return { records: rows, warnings: [], attempts };
  }

  async fetchLastUpdated() {
    this.requireConfigured();
    const { payload } = await fetchJsonWithRetry(this.endpoint(config.eraktkosh.availabilityPath), {
      headers: this.authHeaders(),
    });
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    for (const key of ["lastUpdated", "last_updated", "generatedAt", "generated_at", "updatedAt"]) {
      const value = payload[key];
      if (typeof value === "string") {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
      }
    }
    return null;
  }
}
