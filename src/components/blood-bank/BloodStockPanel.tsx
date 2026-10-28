/**
 * "View Blood Stock" panel.
 *
 * Shows exactly what one centre has reported — nothing estimated, nothing
 * carried over from another centre, nothing shown as available merely because
 * the facility exists. When MEDIPAL holds no report for the centre, the panel
 * says so in plain words and offers the only two actions that can actually
 * help: call, or get directions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { BloodApiError, bloodApi } from "@/services/blood/api";
import type {
  FacilityCard,
  FacilityInventoryDetailResponse,
  FacilityStockLine,
} from "@/services/blood/types";
import {
  AVAILABILITY_STATUS_LABEL,
  AVAILABILITY_STATUS_TONE,
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
import { directionsUrl, telHref } from "@/lib/blood/directions";

/**
 * What the panel is opened for. `reference` is the centre's MEDIPAL public
 * reference — `null` when the facility came from the maps directory and has no
 * MEDIPAL record at all, which is a genuinely different answer from "reported
 * nothing".
 */
export interface StockPanelSubject {
  reference: string | null;
  name: string;
  address: string | null;
  coordinates: [number, number] | null;
  phone: string | null;
  emergencyHotline: string | null;
  /** The published record this entry came from, when there is one. */
  sourceUrl?: string | null;
  sourceLabel?: string | null;
}

type PanelState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; data: FacilityInventoryDetailResponse }
  | { kind: "error"; message: string; code: string; unavailable: boolean };

export function BloodStockPanel({
  subject,
  origin,
  onClose,
}: {
  subject: StockPanelSubject;
  origin: [number, number] | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<PanelState>(
    subject.reference ? { kind: "loading" } : { kind: "missing" },
  );
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (reference: string, signal?: AbortSignal) => {
      setState({ kind: "loading" });
      try {
        const data = await bloodApi.facilityInventory(reference, signal);
        if (signal?.aborted) return;
        setState({ kind: "ready", data });
      } catch (error) {
        if (signal?.aborted) return;
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
          message: "MEDIPAL could not load this centre's reported stock.",
          code: "UNKNOWN",
          unavailable: false,
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (!subject.reference) {
      setState({ kind: "missing" });
      return;
    }
    const controller = new AbortController();
    void load(subject.reference, controller.signal);
    return () => controller.abort();
  }, [subject.reference, load]);

  // Escape closes, and the page behind is frozen while the panel is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const card = state.kind === "ready" ? state.data.facility : null;
  const phone = card?.phone ?? subject.phone;
  const hotline = card?.emergencyHotline ?? subject.emergencyHotline;
  const coordinates = card?.coordinates ?? subject.coordinates;
  const callHref = telHref(phone);
  const hotlineHref = telHref(hotline);
  const mapHref = directionsUrl(
    { coordinates, address: card?.address ?? subject.address, name: card?.name ?? subject.name },
    origin,
  );

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-content-primary/45 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="blood-stock-panel-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="glass-panel glass-hairline my-auto w-full max-w-2xl rounded-3xl p-6 outline-none sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Reported blood stock</p>
            <h2
              id="blood-stock-panel-title"
              className="mt-2 font-display text-xl font-semibold tracking-[-0.02em] text-content-primary sm:text-2xl"
            >
              {card?.name ?? subject.name}
            </h2>
            {card || subject.address ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-content-secondary">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {[card?.address ?? subject.address, card?.city, card?.district, card?.state, card?.postalCode]
                  .filter(Boolean)
                  .join(", ") || "No address published for this centre."}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the blood stock panel"
            className="btn-secondary shrink-0 px-2.5 py-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="divider-glass my-5" />

        {state.kind === "loading" ? (
          <p className="flex items-center gap-3 py-6 text-sm text-content-secondary" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-crimson" aria-hidden />
            Reading this centre's reported stock…
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div className="rounded-2xl border border-line bg-blush-soft px-4 py-4">
            <p className="flex items-start gap-2.5 text-sm font-medium text-content-primary">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
              {state.unavailable
                ? "The blood data service is temporarily unavailable"
                : "This centre's stock could not be read"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-content-secondary">{state.message}</p>
            <p className="mt-1 text-[0.7rem] uppercase tracking-[0.16em] text-content-secondary/70">
              Code {state.code}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-content-secondary">{NO_LIVE_STOCK_COPY}</p>
            {subject.reference ? (
              <button
                type="button"
                onClick={() => void load(subject.reference as string)}
                className="btn-secondary mt-3 gap-2 px-3.5 py-2 text-[0.8rem]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {state.kind === "missing" ? (
          <div className="rounded-2xl border border-line bg-white/70 px-4 py-4">
            <p className="flex items-start gap-2.5 text-sm font-medium text-content-primary">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
              {NO_LIVE_STOCK_COPY}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-content-secondary">
              This facility is listed by the maps directory, which publishes no stock at all. It has
              no MEDIPAL registry record, so MEDIPAL holds no reported figure for it and will not
              invent one. Presence in a directory is not a statement that the facility operates a
              licensed blood bank or holds any group.
            </p>
          </div>
        ) : null}

        {state.kind === "ready" && card ? (
          <StockBody card={card} note={state.data.note} disclaimer={state.data.disclaimer} />
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2.5">
          {callHref ? (
            <a href={callHref} className="btn-primary gap-2 px-4 py-2.5 text-[0.8rem]">
              <Phone className="h-4 w-4" aria-hidden />
              Call Hospital
            </a>
          ) : (
            <span
              aria-disabled
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-line bg-white/60 px-4 py-2.5 text-[0.8rem] text-content-secondary/70"
            >
              <Phone className="h-4 w-4" aria-hidden />
              Phone number unavailable.
            </span>
          )}
          {hotlineHref ? (
            <a href={hotlineHref} className="btn-secondary gap-2 px-4 py-2.5 text-[0.8rem]">
              <Phone className="h-4 w-4" aria-hidden />
              Emergency {hotline}
            </a>
          ) : null}
          {mapHref ? (
            <a
              href={mapHref}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-secondary gap-2 px-4 py-2.5 text-[0.8rem]"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Get Directions
            </a>
          ) : (
            <span
              aria-disabled
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-line bg-white/60 px-4 py-2.5 text-[0.8rem] text-content-secondary/70"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Location not published
            </span>
          )}
        </div>

        <p className="mt-4 text-[0.7rem] leading-relaxed text-content-secondary/80">
          Directions open in Google Maps in a new tab; MEDIPAL does not calculate or guarantee a
          route, and the maps provider uses your device's own position unless you shared one above.
        </p>
      </div>
    </div>
  );
}

function StockBody({
  card,
  note,
  disclaimer,
}: {
  card: FacilityCard;
  note: string;
  disclaimer: string;
}) {
  const distance = formatDistance(card.distanceKm);

  return (
    <div className="grid gap-5">
      {/* Verification, type and provider, always stated. */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em]",
            centreVerificationTone(card.verification),
          )}
        >
          {centreVerificationLabel(card.verification)}
        </span>
        <span className="rounded-full border border-line bg-white/70 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-content-secondary">
          {card.category}
        </span>
        {distance ? (
          <span className="rounded-full border border-line bg-white/70 px-2.5 py-0.5 text-[0.65rem] font-medium text-content-secondary">
            {distance}
          </span>
        ) : null}
        {card.hasBloodBank ? (
          <span className="rounded-full border border-crimson/25 bg-blush px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crimson-soft">
            Blood bank recorded
          </span>
        ) : null}
      </div>

      {card.inventory.lineCount === 0 ? (
        <div className="rounded-2xl border border-line bg-white/70 px-4 py-4">
          <p className="flex items-start gap-2.5 text-sm font-medium text-content-primary">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
            {NO_LIVE_STOCK_COPY}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-content-secondary">
            This centre is approved on MEDIPAL but has not reported a stock figure for any blood
            group or component. That means “not reported”, not “none held”, and it is never shown as
            zero.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-content-primary">
              <ShieldCheck className="h-4 w-4 text-crimson" aria-hidden />
              Reported by the centre
            </h3>
            <span className="text-[0.65rem] uppercase tracking-[0.16em] text-content-secondary/70">
              {card.inventory.lineCount} line{card.inventory.lineCount === 1 ? "" : "s"} ·{" "}
              {card.inventory.totalUnits} {card.inventory.lines[0]?.unit?.toLowerCase() ?? "units"}
            </span>
          </div>

          {card.inventory.lastUpdatedAt ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-content-secondary">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Last updated {relativeTime(card.inventory.lastUpdatedAt)} —{" "}
              {absoluteTime(card.inventory.lastUpdatedAt)}
            </p>
          ) : (
            <p className="mt-2 text-xs text-content-secondary">
              The source did not date this report, so MEDIPAL cannot say how current it is.
            </p>
          )}

          <p className="mt-2 text-xs leading-relaxed text-content-secondary">
            {LIVE_FRESHNESS_EXPLANATION[card.inventory.freshness]}
          </p>

          <ul className="mt-4 grid gap-3">
            {card.inventory.groups.map((group) => (
              <li key={group.bloodGroup} className="rounded-2xl border border-line bg-white/70 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-display text-lg font-semibold text-crimson-soft">
                    {group.bloodGroup}
                  </span>
                  <span className="text-[0.65rem] uppercase tracking-[0.16em] text-content-secondary/70">
                    {group.totalUnits} {group.lines[0]?.unit?.toLowerCase() ?? "units"} in total
                  </span>
                </div>
                <ul className="mt-3 grid gap-2.5">
                  {group.lines.map((line) => (
                    <StockLine key={`${line.bloodGroup}-${line.component}`} line={line} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Provenance (§16, §28) — never omitted. */}
      <div className="rounded-2xl border border-line bg-blush-soft px-4 py-3.5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-content-secondary/80">
          Source and verification
        </p>
        <p className="mt-2 text-xs leading-relaxed text-content-secondary">
          {card.source.url ? (
            <a
              href={card.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-medium text-crimson hover:underline"
            >
              {card.source.label}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <span className="font-medium text-content-primary">{card.source.label}</span>
          )}
          {" · "}
          {card.inventory.providerSynced
            ? "delivered by an authorised feed"
            : "reported directly, not from an authorised feed"}
          {" · "}
          centre {centreVerificationLabel(card.verification).toLowerCase()}
          {card.lastVerifiedAt ? ` (last verified ${absoluteTime(card.lastVerifiedAt)})` : ""}
        </p>
        {card.source.note ? (
          <p className="mt-1.5 text-[0.7rem] leading-relaxed text-content-secondary/85">
            {card.source.note}
          </p>
        ) : null}
      </div>

      <p className="text-[0.7rem] leading-relaxed text-content-secondary/80">{note}</p>
      <p className="text-sm font-medium leading-relaxed text-content-primary">{disclaimer}</p>
    </div>
  );
}

function StockLine({ line }: { line: FacilityStockLine }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/80 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-content-primary">{line.component}</p>
        <p className="mt-0.5 text-[0.68rem] text-content-secondary">
          {line.lastUpdatedAt
            ? `Observed ${relativeTime(line.lastUpdatedAt)} — ${absoluteTime(line.lastUpdatedAt)}`
            : "The source did not date this figure"}
          {line.batchCount > 0 ? ` · ${line.batchCount} batch${line.batchCount === 1 ? "" : "es"}` : ""}
          {line.nearestExpiryDate ? ` · nearest expiry ${line.nearestExpiryDate}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-wider",
            LIVE_FRESHNESS_TONE[line.freshness],
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", LIVE_FRESHNESS_DOT[line.freshness])} />
          {LIVE_FRESHNESS_LABEL[line.freshness]}
        </span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-wider",
            AVAILABILITY_STATUS_TONE[line.availabilityStatus],
          )}
        >
          {AVAILABILITY_STATUS_LABEL[line.availabilityStatus]}
        </span>
        <span className="font-display text-base font-bold text-content-primary">
          {line.units}
          <span className="ml-1 text-[0.6rem] font-medium uppercase tracking-normal text-content-secondary">
            {line.unit}
          </span>
        </span>
      </div>
    </li>
  );
}
