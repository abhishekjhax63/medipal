/**
 * VerifiedBloodCentreProvider — the adapter for stock that a participating
 * blood centre has entered itself through the MEDIPAL centre portal.
 *
 * WHY THIS ONE IS DIFFERENT: every other provider is *pulled* by the sync
 * pipeline. This one is *pushed* — the centre's authorised representative is
 * the author of the row, writing it through the authenticated facility console
 * with `data_source_id = 'blood_centre_verified'`. There is nothing to pull.
 *
 * Re-reading those rows and writing them back would be actively harmful: the
 * availability view sums `quantity` across rows, so a second aggregate row for
 * the same centre/group/component would double-count real stock. So this
 * adapter deliberately publishes nothing into the pipeline and instead exists
 * to (a) sit in the same registry as the feeds, (b) report the health of the
 * manual source, and (c) prove the pipeline handles a push-style source.
 *
 * §23 of the specification requires that a manual figure never blindly
 * overwrite an official feed figure. That is enforced downstream by source
 * priority, not here: these rows keep their own provenance and the API ranks
 * the authorised feed (priority 10) above the centre report (priority 30).
 */

import { dbConfigured, query } from "../../db.mjs";
import { BloodDataProvider, ProviderError, PROVIDER_CODES } from "./base.mjs";

export class VerifiedBloodCentreProvider extends BloodDataProvider {
  constructor(meta = {}) {
    super({
      id: meta.id ?? "blood_centre_verified",
      label: meta.label ?? "Verified blood centre self-report",
      priority: meta.priority ?? 30,
      enabled: meta.enabled ?? true,
    });
    /** Tells the orchestrator that a pull run has nothing to fetch. */
    this.mode = "push";
  }

  isConfigured() {
    return dbConfigured;
  }

  describe() {
    return {
      ...super.describe(),
      mode: this.mode,
      managedBy: "centre_portal",
      note:
        "Stock from this source is written by an authenticated blood-centre user through the MEDIPAL " +
        "centre portal. It is ranked below an official authorised feed so a provider figure is never " +
        "overwritten by a manual one.",
    };
  }

  /**
   * Health is measured by whether verified centres are actually reporting, not
   * by a network probe — there is no network call to make.
   */
  async healthCheck() {
    const checkedAt = new Date().toISOString();
    if (!dbConfigured) {
      return {
        status: "not_configured",
        message: "The MEDIPAL database is not configured, so centre self-reports cannot be read.",
        checkedAt,
      };
    }
    try {
      const result = await query(
        `select count(*)::integer as centres,
                max(i.source_updated_at) as latest_observation
           from blood_facilities f
           left join blood_inventory i on i.facility_id = f.id
          where f.data_source_id = $1`,
        [this.id],
      );
      const centres = result.rows[0]?.centres ?? 0;
      const latest = result.rows[0]?.latest_observation ?? null;
      if (centres === 0) {
        return {
          status: "unknown",
          message:
            "No blood centre has published a verified self-report yet. This is not a failure — it means " +
            "no centre has been onboarded.",
          checkedAt,
        };
      }
      return {
        status: "healthy",
        message: `${centres} verified centre${centres === 1 ? "" : "s"} on the register.`,
        checkedAt,
        latestObservation: latest ? new Date(latest).toISOString() : null,
      };
    } catch (error) {
      return { status: "degraded", message: error.message, checkedAt };
    }
  }

  fetchBloodCentres() {
    return Promise.reject(
      new ProviderError(
        "Verified centre records are authored in the MEDIPAL database itself; there is nothing to pull.",
        PROVIDER_CODES.UNSUPPORTED,
      ),
    );
  }

  async fetchAvailability() {
    // An explicit, empty result with a reason — never a silent success that
    // could be mistaken for "the centres reported zero units".
    return {
      records: [],
      warnings: [
        "Centre self-reports are written directly by the centre portal and are already live rows in " +
          "`blood_inventory`. Nothing is re-published here, because doing so would double-count stock.",
      ],
      attempts: 0,
    };
  }
}

/**
 * The provenance id every centre self-report is written under. Kept in one
 * place so the portal and this adapter can never disagree.
 */
export const CENTRE_VERIFIED_SOURCE_ID = "blood_centre_verified";
