/**
 * A single ambulance operator card.
 *
 * Everything shown here comes from the server's approved-provider payload. When
 * a fare or a response estimate has never been confirmed, the card says so
 * instead of printing a number, and it never draws a "live" tracking promise
 * unless the operator actually runs a dispatch feed.
 */

import { Clock, MapPin, Phone, Radio, ShieldCheck } from "lucide-react";
import { EuBadge } from "@/components/eupchar/ui";
import { cn } from "@/lib/cn";
import {
  AVAILABILITY_LABEL,
  AVAILABILITY_SOURCE_LABEL,
  AVAILABILITY_TONE,
  CATEGORY_META,
  formatFarePaise,
  formatRelativeTime,
} from "@/lib/ambulance/presentation";
import type { AmbulanceCategory, AmbulanceProvider, ProviderCategoryCoverage } from "@/services/ambulance/types";

function CoverageRow({ coverage }: { coverage: ProviderCategoryCoverage }) {
  const fare = formatFarePaise(coverage.baseFarePaise);
  const perKm = formatFarePaise(coverage.perKmPaise);
  const confirmedAt = formatRelativeTime(coverage.lastConfirmedAt);

  return (
    <div className="rounded-2xl border border-line bg-white/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-content-primary">
          {coverage.category}
          <span className="ml-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-secondary">
            {CATEGORY_META[coverage.category]?.short}
          </span>
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em]",
            AVAILABILITY_TONE[coverage.availability],
          )}
        >
          {AVAILABILITY_LABEL[coverage.availability]}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.78rem] text-content-secondary">
        <div>
          <dt className="sr-only">Base fare</dt>
          <dd>
            {fare ? (
              <>
                Base <span className="font-semibold text-content-primary">{fare}</span>
                {perKm ? <span className="text-content-secondary"> · {perKm}/km</span> : null}
              </>
            ) : (
              <span>Fare not published</span>
            )}
          </dd>
        </div>
        <div className="text-right">
          <dt className="sr-only">Response estimate</dt>
          <dd>
            {coverage.estimatedResponseMinutes !== null ? (
              <>
                Operator estimate{" "}
                <span className="font-semibold text-content-primary">
                  ~{coverage.estimatedResponseMinutes} min
                </span>
              </>
            ) : (
              <span>Response time not published</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-[0.72rem] leading-relaxed text-content-secondary/90">
        {coverage.confirmed && confirmedAt ? (
          <>
            Availability from {AVAILABILITY_SOURCE_LABEL[coverage.availabilitySource]}, last given{" "}
            {confirmedAt}.
          </>
        ) : (
          <>Availability has not been confirmed by this operator — treat it as unknown and telephone to check.</>
        )}
      </p>
      {coverage.notes && (
        <p className="mt-1 text-[0.72rem] italic leading-relaxed text-content-secondary/80">
          Operator note: {coverage.notes}
        </p>
      )}
    </div>
  );
}

export function ProviderCard({
  provider,
  focusCategory,
  onBook,
  busy = false,
}: {
  provider: AmbulanceProvider;
  /** When the patient searched for one category, highlight it. */
  focusCategory?: AmbulanceCategory | null;
  onBook?: (provider: AmbulanceProvider, category: AmbulanceCategory) => void;
  busy?: boolean;
}) {
  const covering = focusCategory
    ? provider.categories.filter((entry) => entry.category === focusCategory)
    : provider.categories;
  const shown = covering.length > 0 ? covering : provider.categories;
  const dialable = provider.emergencyHotline || provider.contactPhone;

  return (
    <article className="glass-panel flex h-full flex-col rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold text-content-primary">
            {provider.name}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] text-content-secondary">
            <span>{provider.providerType}</span>
            {provider.coordinatesVerified && (
              <EuBadge tone="ok">
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Coordinates verified
              </EuBadge>
            )}
            {provider.liveTrackingAvailable && (
              <EuBadge tone="neutral">
                <Radio className="h-3 w-3" aria-hidden />
                Dispatch feed
              </EuBadge>
            )}
          </p>
        </div>
      </div>

      {(provider.address || provider.city || provider.district || provider.state) && (
        <p className="mt-3 flex items-start gap-2 text-[0.78rem] leading-relaxed text-content-secondary">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crimson-bright" aria-hidden />
          <span>
            {[provider.address, provider.city, provider.district, provider.state]
              .filter(Boolean)
              .join(", ")}
          </span>
        </p>
      )}

      {provider.serviceArea && (
        <p className="mt-1.5 text-[0.78rem] leading-relaxed text-content-secondary">
          Service area: {provider.serviceArea}
        </p>
      )}

      {provider.operatingHours && (
        <p className="mt-1 flex items-center gap-2 text-[0.78rem] text-content-secondary">
          <Clock className="h-3.5 w-3.5 shrink-0 text-crimson-bright" aria-hidden />
          {provider.operatingHours}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {shown.map((coverage) => (
          <CoverageRow key={coverage.category} coverage={coverage} />
        ))}
        {shown.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line bg-white/60 p-3 text-[0.78rem] text-content-secondary">
            This operator has not published which categories it runs. Telephone to confirm.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
        {dialable ? (
          <a href={`tel:${dialable}`} className="btn-secondary px-4 py-2 text-[0.8rem]">
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Call {dialable}
          </a>
        ) : (
          <span className="text-[0.78rem] text-content-secondary">No telephone number published.</span>
        )}

        {onBook && (
          <button
            type="button"
            disabled={busy || shown.length === 0}
            onClick={() => onBook(provider, (focusCategory ?? shown[0]?.category) as AmbulanceCategory)}
            className="btn-primary px-4 py-2 text-[0.8rem]"
          >
            Request this operator
          </button>
        )}
      </div>

      {provider.sourceNote && (
        <p className="mt-3 border-t border-line pt-3 text-[0.7rem] leading-relaxed text-content-secondary/80">
          {provider.sourceNote}
        </p>
      )}
    </article>
  );
}
