/**
 * The provider registry.
 *
 * §22 of the specification asks for:
 *
 *   ProviderAdapter
 *     ├── ERaktKoshProvider
 *     ├── VerifiedBloodCentreProvider
 *     └── FutureProvider
 *
 * This module is that tree. It owns the one place where a source's enabled flag
 * and priority are resolved, so the sync pipeline, the API and the admin
 * console all agree about which source outranks which.
 *
 * The database register (`blood_data_sources`) is the authority once a row
 * exists, because an operator must be able to disable a source or change its
 * priority without a code change. The hard-coded values here are only the
 * fallback for the moment before migrations have run.
 */

import { query } from "../../db.mjs";
import { BloodDataProvider, ProviderError, PROVIDER_CODES } from "./base.mjs";
import { ERaktKoshProvider } from "./eraktkosh.mjs";
import { VerifiedBloodCentreProvider } from "./verified-centre.mjs";

/**
 * A placeholder for an authorised source that has not been implemented yet.
 * It is registered so the priority ladder and the admin console can show that
 * MEDIPAL expects another feed; it refuses to run rather than pretending to.
 */
export class FutureProvider extends BloodDataProvider {
  constructor(meta) {
    super({ ...meta, enabled: false });
  }

  fetchBloodCentres() {
    return Promise.reject(
      new ProviderError(
        `${this.label} has no adapter yet. Add one under server/blood/providers/ before enabling it.`,
        PROVIDER_CODES.UNSUPPORTED,
      ),
    );
  }

  async fetchAvailability() {
    return {
      records: [],
      warnings: [`${this.label} has no adapter yet, so no figures are read from it.`],
      attempts: 0,
    };
  }
}

/** Static defaults. `priority` is the tie-break the API applies; lower wins. */
const STATIC_DEFAULTS = [
  { id: "eraktkosh_authorized_feed", label: "e-RaktKosh authorised feed", priority: 10, enabled: false },
  { id: "blood_centre_verified", label: "Verified blood centre self-report", priority: 30, enabled: true },
  { id: "other_authorized_feed", label: "Other authorised provider feed", priority: 50, enabled: false },
];

function instantiate(meta) {
  switch (meta.id) {
    case "eraktkosh_authorized_feed":
      return new ERaktKoshProvider(meta);
    case "blood_centre_verified":
      return new VerifiedBloodCentreProvider(meta);
    default:
      return new FutureProvider(meta);
  }
}

let cache = null;

/**
 * Builds the provider list, merging the database register over the static
 * defaults. A register row that does not correspond to a known adapter becomes
 * a FutureProvider, so the console can show it without pretending it works.
 */
export async function loadProviders() {
  let registerRows = [];
  try {
    const result = await query(
      `select id, name, enabled, priority, health_status, last_successful_sync, last_failed_sync
         from blood_data_sources
        where id in ('eraktkosh_authorized_feed', 'blood_centre_verified', 'other_authorized_feed')`,
    );
    registerRows = result.rows;
  } catch {
    // Before migrations 006 has run the register is absent; the static defaults
    // are still safe because an unconfigured provider reads nothing.
    registerRows = [];
  }

  const byId = new Map(registerRows.map((row) => [row.id, row]));
  const providers = STATIC_DEFAULTS.map((fallback) => {
    const row = byId.get(fallback.id);
    return instantiate({
      id: fallback.id,
      label: row?.name ?? fallback.label,
      priority: row?.priority ?? fallback.priority,
      enabled: row?.enabled ?? fallback.enabled,
    });
  });

  cache = providers;
  return providers;
}

/** The cached list, loading it first if necessary. */
export async function getProviders() {
  if (!cache) await loadProviders();
  return cache;
}

/** @returns {Promise<BloodDataProvider>} */
export async function getProvider(id) {
  const providers = await getProviders();
  const found = providers.find((provider) => provider.id === id);
  if (!found) {
    throw new ProviderError(`Unknown provider "${id}".`, PROVIDER_CODES.UNSUPPORTED);
  }
  return found;
}

/**
 * The sources a scheduled pull should actually run: enabled AND configured.
 * An enabled-but-unconfigured source is not an error — it simply contributes
 * nothing until credentials arrive, and its health is reported as
 * `not_configured`.
 */
export async function getRunnableProviders() {
  const providers = await getProviders();
  return providers.filter((provider) => provider.enabled && provider.mode !== "push" && provider.isConfigured());
}

/** Invalidates the cache so the next read reflects a register change. */
export function invalidateProviderCache() {
  cache = null;
}

export { ERaktKoshProvider, VerifiedBloodCentreProvider };
