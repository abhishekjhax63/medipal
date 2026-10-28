/**
 * MEDIPAL blood-centre cards.
 *
 * One card per approved centre, built from `/api/blood/facilities/cards`, with
 * the centre's own reported stock nested inside it. Nothing here is inferred:
 *
 *   · A centre that has reported nothing still gets a card, and that card says
 *     "not reported" — never "zero units" and never "unavailable".
 *   · Verification is shown exactly as the record holds it.
 *   · Phone numbers and coordinates come from the centre's published record, or
 *     the button says the field is unavailable.
 *
 * The maps-directory search below it is a different question — "where are blood
 * services?" — and is deliberately kept separate. The two are never blended.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  Clock,
  ExternalLink,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { BloodApiError, bloodApi } from "@/services/blood/api";
import {
  BLOOD_COMPONENTS,
  type BiharDistrict,
  type BloodComponent,
  type FacilityCard,
  type FacilityCardSort,
  type FacilityCardsResponse,
} from "@/services/blood/types";
import {
  LIVE_FRESHNESS_DOT,
  LIVE_FRESHNESS_EXPLANATION,
  LIVE_FRESHNESS_LABEL,
  LIVE_FRESHNESS_TONE,
  NO_LIVE_STOCK_COPY,
  absoluteTime,
  centreVerificationLabel,
  centreVerificationTone,
  formatDistance,
  relativeTime,
} from "@/lib/blood/presentation";
import { directionsUrl, telHref, useDirectionsOrigin } from "@/lib/blood/directions";
import { BloodStockPanel, type StockPanelSubject } from "./BloodStockPanel";

const STATE = "Bihar";
const BLOOD_GROUP_FILTERS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const SORT_OPTIONS: readonly { value: FacilityCardSort; label: string }[] = [
  { value: "priority", label: "Source priority" },
  { value: "distance", label: "Nearest first" },
  { value: "freshness", label: "Most recently reported first" },
  { value: "name", label: "Name (A–Z)" },
];

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: FacilityCardsResponse }
  | { kind: "error"; message: string; code: string; unavailable: boolean };

export function BloodCentreCards({ className }: { className?: string }) {
  const [bloodGroup, setBloodGroup] = useState("");
  const [component, setComponent] = useState<BloodComponent | "">("");
  const [district, setDistrict] = useState("");
  const [sortBy, setSortBy] = useState<FacilityCardSort>("priority");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [districts, setDistricts] = useState<BiharDistrict[]>([]);
  const [panel, setPanel] = useState<StockPanelSubject | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const location = useDirectionsOrigin();
  const origin = location.origin;

  const load = useCallback(
    async (options: { silent?: boolean; signal?: AbortSignal } = {}) => {
      if (options.silent) setRefreshing(true);
      else setState({ kind: "loading" });

      try {
        const data = await bloodApi.facilityCards(
          {
            state: STATE,
            district: district || undefined,
            bloodGroup: bloodGroup || undefined,
            component: component || undefined,
            latitude: origin ? origin[0] : undefined,
            longitude: origin ? origin[1] : undefined,
            sortBy: origin && sortBy === "priority" ? "distance" : sortBy,
            limit: 120,
          },
          options.signal,
        );
        if (options.signal?.aborted) return;
        setState({ kind: "ready", data });
      } catch (error) {
        if (options.signal?.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof BloodApiError) {
          setState({
            kind: "error",
            message: error.message,
            code: error.code,
            unavailable: error.isUnavailable,
          });
          return;
        }
        setState({
          kind: "error",
          message: "MEDIPAL could not read its blood centre registry.",
          code: "UNKNOWN",
          unavailable: false,
        });
      } finally {
        setRefreshing(false);
      }
    },
    [bloodGroup, component, district, origin, sortBy],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  // The district list is a convenience for a 38-district state. If it fails the
  // filter simply stays empty rather than breaking the page.
  useEffect(() => {
    const controller = new AbortController();
    bloodApi
      .districts({ state: STATE }, controller.signal)
      .then((payload) => setDistricts(payload.districts))
      .catch(() => setDistricts([]));
    return () => controller.abort();
  }, []);

  const activeFilters = Boolean(bloodGroup || component || district);

  const summary = useMemo(() => {
    if (state.kind !== "ready") return null;
    const { counts, cards } = state.data;
    return {
      centres: counts.facilities,
      reported: counts.withReportedStock,
      lines: counts.lines,
      unreported: cards.filter((card) => !card.inventory.reported).length,
    };
  }, [state]);

  return (
    <div className={cn(className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">MEDIPAL registry</p>
          <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.02em] text-content-primary sm:text-[1.7rem]">
            Blood centres and what they actually reported
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-content-secondary">
            Every figure below was reported by the centre itself and carries the time the source
            observed it. A centre that has reported nothing still appears here — that means “no
            report received”, never “no blood held”.
          </p>
        </div>
        {state.kind === "ready" ? (
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            disabled={refreshing}
            className="btn-secondary shrink-0 gap-2 px-3.5 py-2 text-[0.8rem]"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
            Refresh
          </button>
        ) : null}
      </div>

      {/* ---- Filters -------------------------------------------------------- */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="field-label" htmlFor="centre-group">
            Blood group
          </label>
          <select
            id="centre-group"
            className="field"
            value={bloodGroup}
            onChange={(event) => setBloodGroup(event.target.value)}
          >
            <option value="">Any group</option>
            {BLOOD_GROUP_FILTERS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="centre-component">
            Component
          </label>
          <select
            id="centre-component"
            className="field"
            value={component}
            onChange={(event) => setComponent(event.target.value as BloodComponent | "")}
          >
            <option value="">Any component</option>
            {BLOOD_COMPONENTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="centre-district">
            District
          </label>
          <select
            id="centre-district"
            className="field"
            value={district}
            onChange={(event) => setDistrict(event.target.value)}
          >
            <option value="">All {STATE}</option>
            {districts.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="centre-sort">
            Order by
          </label>
          <select
            id="centre-sort"
            className="field"
            value={origin && sortBy === "priority" ? "distance" : sortBy}
            onChange={(event) => setSortBy(event.target.value as FacilityCardSort)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={origin ? location.clear : location.request}
          className={cn("btn-secondary gap-2 px-3.5 py-2 text-[0.8rem]", origin && "border-crimson/40 text-crimson-soft")}
        >
          {location.state === "locating" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" aria-hidden />
          )}
          {origin ? "Clear my location" : "Use my location"}
        </button>
        {activeFilters ? (
          <button
            type="button"
            onClick={() => {
              setBloodGroup("");
              setComponent("");
              setDistrict("");
            }}
            className="btn-secondary gap-2 px-3.5 py-2 text-[0.8rem]"
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden />
            Clear filters
          </button>
        ) : null}
        <span className="text-[0.7rem] leading-relaxed text-content-secondary/80">
          Sharing a location only sorts the list and sets the start of a directions link.
        </span>
      </div>

      {location.message ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-line bg-blush-soft px-4 py-3 text-xs leading-relaxed text-content-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crimson" aria-hidden />
          {location.message}
        </p>
      ) : null}

      {/* ---- Results -------------------------------------------------------- */}
      <div className="mt-7" aria-live="polite">
        {state.kind === "loading" ? (
          <p className="flex items-center gap-3 text-sm text-content-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-crimson" aria-hidden />
            Reading the MEDIPAL blood centre registry…
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div className="rounded-2xl border border-line bg-blush-soft px-4 py-4">
            <p className="flex items-start gap-2.5 text-sm font-medium text-content-primary">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
              {state.unavailable
                ? "The blood centre registry is temporarily unavailable"
                : "The blood centre registry could not be read"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-content-secondary">{state.message}</p>
            <p className="mt-1 text-[0.7rem] uppercase tracking-[0.16em] text-content-secondary/70">
              Code {state.code}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="btn-secondary mt-3 gap-2 px-3.5 py-2 text-[0.8rem]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </button>
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <div className="grid gap-4">
            {summary ? (
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-secondary">
                <span>
                  {summary.centres} approved centre{summary.centres === 1 ? "" : "s"}
                </span>
                <span>
                  {summary.reported} reporting stock · {summary.unreported} not reporting
                </span>
                <span>{summary.lines} reported line{summary.lines === 1 ? "" : "s"}</span>
                {state.data.truncated ? <span>list truncated</span> : null}
              </p>
            ) : null}

            {state.data.cards.length === 0 ? (
              <p className="rounded-2xl border border-line bg-white/70 px-4 py-4 text-sm leading-relaxed text-content-secondary">
                {activeFilters
                  ? "No approved centre has reported that combination. MEDIPAL shows an empty list rather than an estimate — try another group, or search the directory below for a facility to call."
                  : "No blood centre has been approved on MEDIPAL in this area yet. Centres appear here only after review and after they report stock. Use the directory below to find real facilities to call."}
              </p>
            ) : (
              <ul className="grid gap-4">
                {state.data.cards.map((card) => (
                  <li key={card.centreId}>
                    <CentreCard
                      card={card}
                      origin={origin}
                      onViewStock={() =>
                        setPanel({
                          reference: card.reference,
                          name: card.name,
                          address: card.address,
                          coordinates: card.coordinates,
                          phone: card.phone,
                          emergencyHotline: card.emergencyHotline,
                          sourceUrl: card.source.url,
                          sourceLabel: card.source.label,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[0.7rem] leading-relaxed text-content-secondary/80">
              {state.data.notice} Generated {absoluteTime(state.data.generatedAt)} (
              {relativeTime(state.data.generatedAt)}).
            </p>
            <p className="text-[0.7rem] font-medium leading-relaxed text-content-primary">
              {state.data.disclaimer}
            </p>
          </div>
        ) : null}
      </div>

      {panel ? (
        <BloodStockPanel subject={panel} origin={origin} onClose={() => setPanel(null)} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One centre card (§4)
// ---------------------------------------------------------------------------

function CentreCard({
  card,
  origin,
  onViewStock,
}: {
  card: FacilityCard;
  origin: [number, number] | null;
  onViewStock: () => void;
}) {
  const distance = formatDistance(card.distanceKm);
  const callHref = telHref(card.phone);
  const hotlineHref = telHref(card.emergencyHotline);
  const mapHref = directionsUrl(
    { coordinates: card.coordinates, address: card.address, name: card.name },
    origin,
  );
  const locality = [card.city, card.district, card.state, card.postalCode]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(", ");

  return (
    <article className="rounded-2xl border border-line bg-white/70 p-4 backdrop-blur-md sm:p-5">
      {/* ---- Top row: name, verification, type ------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display text-base font-semibold tracking-[-0.01em] text-content-primary">
            {card.name}
          </h4>
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em]",
                centreVerificationTone(card.verification),
              )}
            >
              {centreVerificationLabel(card.verification)}
            </span>
            <span className="rounded-full border border-line bg-white/80 px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-content-secondary">
              {card.category}
            </span>
          </p>
        </div>
        {distance ? (
          <span className="shrink-0 rounded-full border border-line bg-white/80 px-2.5 py-1 text-[0.7rem] font-medium text-content-secondary">
            {distance}
          </span>
        ) : null}
      </div>

      {/* ---- Middle: address, contact, stock summary -------------------- */}
      <div className="mt-3 grid gap-1.5 text-xs leading-relaxed text-content-secondary">
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {card.address || "No street address published"}
            {locality ? <span className="block text-content-secondary/80">{locality}</span> : null}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {callHref ? (
            <a
              href={callHref}
              className="inline-flex items-center gap-1.5 font-medium text-crimson-soft hover:underline"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {card.phone}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Phone number unavailable.
            </span>
          )}
          {hotlineHref ? (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Emergency {card.emergencyHotline}
            </span>
          ) : null}
          {card.operatingHours ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {card.operatingHours}
            </span>
          ) : null}
        </p>
      </div>

      <InventorySummary card={card} />

      {/* ---- Bottom action row ---------------------------------------- */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <button type="button" onClick={onViewStock} className="btn-primary justify-center gap-2 px-3.5 py-2.5 text-[0.8rem]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          View Blood Stock
        </button>
        {callHref ? (
          <a href={callHref} className="btn-secondary justify-center gap-2 px-3.5 py-2.5 text-[0.8rem]">
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Call Hospital
          </a>
        ) : (
          <span
            aria-disabled
            className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-line bg-white/60 px-3.5 py-2.5 text-[0.8rem] text-content-secondary/70"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Phone number unavailable.
          </span>
        )}
        {mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-secondary justify-center gap-2 px-3.5 py-2.5 text-[0.8rem]"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden />
            Get Directions
          </a>
        ) : (
          <span
            aria-disabled
            className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-line bg-white/60 px-3.5 py-2.5 text-[0.8rem] text-content-secondary/70"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden />
            Location not published
          </span>
        )}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] leading-relaxed text-content-secondary/80">
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="h-3 w-3.5 shrink-0" aria-hidden />
          {card.source.url ? (
            <a
              href={card.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-medium text-crimson-soft hover:underline"
            >
              {card.source.label}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            card.source.label
          )}
        </span>
        {/* Only centres that published a coordinate get a map link. */}
        {card.coordinates ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${card.coordinates[0]}&mlon=${card.coordinates[1]}#map=16/${card.coordinates[0]}/${card.coordinates[1]}`}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-dotted underline-offset-2"
          >
            View on map
          </a>
        ) : (
          <span>No coordinates published</span>
        )}
      </p>
    </article>
  );
}

/**
 * The stock summary. A centre with no report is explicitly *not* shown as
 * holding nothing — the wording is fixed and says exactly what is missing.
 */
function InventorySummary({ card }: { card: FacilityCard }) {
  if (!card.inventory.reported) {
    return (
      <div className="mt-3 rounded-xl border border-line bg-white/70 px-3.5 py-3">
        <p className="flex items-start gap-2 text-[0.72rem] leading-relaxed text-content-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crimson" aria-hidden />
          <span>
            <span className="font-medium text-content-primary">{NO_LIVE_STOCK_COPY}</span> No figure
            has been reported to MEDIPAL for this centre, which is not a statement that it holds
            none.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-blush-soft/60 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-wider",
            LIVE_FRESHNESS_TONE[card.inventory.freshness],
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", LIVE_FRESHNESS_DOT[card.inventory.freshness])} />
          {LIVE_FRESHNESS_LABEL[card.inventory.freshness]}
        </span>
        <span className="text-[0.7rem] text-content-secondary">
          {card.inventory.lastUpdatedAt
            ? `Last updated ${relativeTime(card.inventory.lastUpdatedAt)} — ${absoluteTime(card.inventory.lastUpdatedAt)}`
            : "The source did not date this report"}
        </span>
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-2">
        {card.inventory.groups.map((group) => (
          <li
            key={group.bloodGroup}
            className="flex items-center gap-2 rounded-lg border border-line bg-white/80 px-2.5 py-1.5"
          >
            <span className="font-display text-sm font-semibold text-crimson-soft">
              {group.bloodGroup}
            </span>
            <span className="text-[0.68rem] text-content-secondary">
              {group.totalUnits} {group.lines[0]?.unit?.toLowerCase() ?? "units"}
              {group.lines.length > 1 ? ` · ${group.lines.length} components` : ""}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[0.68rem] leading-relaxed text-content-secondary/85">
        {LIVE_FRESHNESS_EXPLANATION[card.inventory.freshness]}
      </p>
    </div>
  );
}
