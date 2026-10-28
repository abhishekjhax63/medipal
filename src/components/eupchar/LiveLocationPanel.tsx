import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Compass,
  ExternalLink,
  Info,
  LocateFixed,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { EuCard, EuNotice } from "@/components/eupchar/ui";
import { directionsUrl, telHref } from "@/lib/blood/directions";
import { biharDistrictReference } from "@/data/eupchar/directory";
import {
  FACILITY_KIND_LABEL,
  formatFacilityDistance,
  type Facility,
  type FacilitySearchResponse,
} from "@/services/facilities/types";
import { FacilityApiError, currentPosition, facilityApi } from "@/services/facilities/api";

/**
 * Optional live-location helper for E-UPCHAR (spec §4).
 *
 * The visitor's position is requested **only** when they press the button — the
 * page never prompts on load. The coordinates are used for the single search
 * that follows and are held in component memory only: they are never written to
 * storage and never sent anywhere except MEDIPAL's own facility proxy.
 *
 * Everything shown here is what OpenStreetMap actually publishes. A facility
 * with no phone number says so; services are reported as not published rather
 * than filled in. A denial is never fatal — manual state/district selection
 * keeps working and the copy explains how to re-enable permission.
 */

type PanelPhase =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | {
      kind: "ready";
      data: FacilitySearchResponse;
      placeLabel: string | null;
      detectedDistrict: string | null;
    }
  | { kind: "error"; message: string; code: string; retryable: boolean };

const SEARCH_RADIUS_KM = 25;
const SEARCH_TYPES = ["hospital", "clinic"] as const;

/**
 * Best-effort mapping of a reverse-geocoded place label onto a district that
 * exists in the verified dataset. Matches whole words only, and prefers the
 * longest name, so "West Champaran" never silently becomes "Champaran".
 */
function matchDatasetDistrict(place: string | null): string | null {
  if (!place) return null;
  const haystack = place.toLowerCase();
  let best: { district: string; length: number } | null = null;
  for (const entry of biharDistrictReference) {
    const base = entry.district.split("(")[0].trim().toLowerCase();
    if (base.length < 4) continue;
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(haystack)) {
      if (!best || base.length > best.length) best = { district: entry.district, length: base.length };
    }
  }
  return best?.district ?? null;
}

export function LiveLocationPanel({
  onDistrictDetected,
  className,
}: {
  /** Called when the detected place maps onto a district in the dataset. */
  onDistrictDetected: (district: string) => void;
  className?: string;
}) {
  const [phase, setPhase] = useState<PanelPhase>({ kind: "idle" });
  const [directoryNote, setDirectoryNote] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Find out whether the directory is reachable before blaming the visitor's
  // device — a deployment with no directory configured must say so.
  useEffect(() => {
    const controller = new AbortController();
    facilityApi
      .status(controller.signal)
      .then((status) => {
        if (status.status !== "live") {
          setDirectoryNote(
            "The facility directory is not configured on this deployment, so nearby search is unavailable. Manual state and district selection below still works.",
          );
        }
      })
      .catch(() => {
        setDirectoryNote(
          "MEDIPAL could not confirm the facility directory status. Nearby search may be unavailable right now.",
        );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase({ kind: "working", label: "Getting your location…" });

    let latitude: number;
    let longitude: number;
    try {
      const position = await currentPosition();
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (error) {
      if (controllerRef.current !== controller) return;
      const denied = error instanceof FacilityApiError && error.code === "PERMISSION_DENIED";
      setPhase({
        kind: "error",
        code: error instanceof FacilityApiError ? error.code : "POSITION_UNAVAILABLE",
        retryable: true,
        message: denied
          ? "Location permission was declined. Nothing was detected, and manual state and district selection below still works. To use this feature, allow location access for this site in your browser's site settings, then try again."
          : error instanceof FacilityApiError
            ? error.message
            : "Your device could not provide a location. Enter a state and district manually below instead.",
      });
      return;
    }

    setPhase({ kind: "working", label: "Finding healthcare facilities near you…" });

    // The place label is cosmetic and doubles as the district hint. A failure
    // here must not stop the search itself.
    let placeLabel: string | null = null;
    try {
      const place = await facilityApi.reverse(latitude, longitude, controller.signal);
      placeLabel = place.formatted || null;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      placeLabel = null;
    }
    if (controllerRef.current !== controller) return;

    try {
      const data = await facilityApi.search(
        {
          latitude,
          longitude,
          radiusKm: SEARCH_RADIUS_KM,
          types: SEARCH_TYPES,
          sortBy: "distance",
          limit: 12,
        },
        controller.signal,
      );
      if (controllerRef.current !== controller) return;
      const detectedDistrict = matchDatasetDistrict(placeLabel ?? data.areaLabel);
      if (detectedDistrict) onDistrictDetected(detectedDistrict);
      setPhase({ kind: "ready", data, placeLabel, detectedDistrict });
    } catch (error) {
      if (controllerRef.current !== controller) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        setPhase({
          kind: "error",
          code: "TIMEOUT",
          retryable: true,
          message:
            "The public OpenStreetMap directory is heavily loaded and did not answer in time. Please try again in a moment, or choose your state and district manually below.",
        });
        return;
      }
      if (error instanceof FacilityApiError) {
        setPhase({ kind: "error", code: error.code, retryable: error.code !== "PERMISSION_DENIED", message: error.message });
        return;
      }
      setPhase({
        kind: "error",
        code: "UNKNOWN",
        retryable: true,
        message: "MEDIPAL could not complete the nearby search. Please try again, or select a district manually below.",
      });
    }
  }, [onDistrictDetected]);

  const origin: [number, number] | null =
    phase.kind === "ready" && phase.data.origin
      ? [phase.data.origin.latitude, phase.data.origin.longitude]
      : null;

  return (
    <EuCard className={cn("p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eu-eyebrow">Optional</p>
          <h2 className="mt-2 text-[1.02rem] font-semibold text-eu-text">Use my current location</h2>
          <p className="mt-1.5 max-w-2xl text-[0.85rem] leading-relaxed text-eu-muted">
            Ask your browser for your position and list real nearby hospitals from OpenStreetMap,
            nearest first. Your location is requested only when you press the button — not when the
            page opens — and it is used for this search alone.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={phase.kind === "working"}
          className={cn(
            "eu-btn gap-2 px-4 py-2.5",
            phase.kind === "working"
              ? "cursor-wait border border-eu-border bg-eu-surface text-eu-muted/70"
              : "eu-btn-primary",
          )}
        >
          {phase.kind === "working" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <LocateFixed className="h-4 w-4" aria-hidden />
          )}
          Use my current location
        </button>
      </div>

      <p className="mt-3 text-[0.75rem] leading-relaxed text-eu-muted">
        MEDIPAL does not store your coordinates and does not send them to anyone other than its own
        facility directory. On the web, browsers only share a location over HTTPS.
      </p>

      {directoryNote ? (
        <EuNotice tone="warn" className="mt-4" title="Facility directory status">
          {directoryNote}
        </EuNotice>
      ) : null}

      {phase.kind === "working" ? (
        <p className="mt-4 flex items-center gap-3 text-sm text-eu-muted" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {phase.label}
        </p>
      ) : null}

      {phase.kind === "idle" && !directoryNote ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-eu-border bg-eu-surface px-4 py-3 text-[0.8rem] leading-relaxed text-eu-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Prefer to choose yourself? Manual state and district selection below always works and is
            never replaced by a detected location.
          </span>
        </p>
      ) : null}

      {phase.kind === "error" ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#f3c4c0] bg-[#fdf1f0] px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-eu-red-deep" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-eu-text">Live location is unavailable</p>
            <p className="mt-1.5 text-[0.82rem] leading-relaxed text-eu-muted">{phase.message}</p>
            <p className="mt-2 text-[0.68rem] uppercase tracking-[0.16em] text-eu-muted">
              Code {phase.code}
            </p>
            {phase.retryable ? (
              <button
                type="button"
                onClick={() => void run()}
                className="eu-btn eu-btn-quiet mt-3 gap-2 px-3.5 py-2 text-[0.8rem]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase.kind === "ready" ? (
        <div className="mt-5 grid gap-4" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-eu-muted">
              <Navigation className="h-3.5 w-3.5" aria-hidden />
              {phase.placeLabel ? `Near ${phase.placeLabel}` : "Near your current position"}
            </p>
            <span className="text-[0.7rem] uppercase tracking-[0.16em] text-eu-muted">
              {phase.data.facilities.length} shown
              {phase.data.totalMatching > phase.data.facilities.length
                ? ` of ${phase.data.totalMatching} matching`
                : ""}
              {" · "}
              {phase.data.radiusMeters / 1000} km radius
            </span>
          </div>

          {phase.detectedDistrict ? (
            <EuNotice tone="info" title="District set from your location">
              We recognised <span className="font-medium text-eu-text">{phase.detectedDistrict}</span>{" "}
              from your position and selected it below. Districts are chosen from the verified dataset,
              so nothing was invented. You can change it at any time.
            </EuNotice>
          ) : (
            <EuNotice tone="info" title="District not recognised">
              Your position could not be matched to a district in the verified dataset, so the manual
              selection below is unchanged. Pick your state and district there to continue.
            </EuNotice>
          )}

          {phase.data.facilities.length === 0 ? (
            <p className="rounded-2xl border border-eu-border bg-eu-surface px-4 py-3.5 text-[0.85rem] leading-relaxed text-eu-muted">
              OpenStreetMap holds no matching healthcare facility inside{" "}
              {phase.data.radiusMeters / 1000} km of your position. That is what the source contains
              — MEDIPAL will not fill the list with facilities it cannot verify. Choose your district
              manually below.
            </p>
          ) : (
            <ul className="grid gap-3">
              {phase.data.facilities.map((facility) => (
                <li key={facility.id}>
                  <NearbyFacilityRow facility={facility} origin={origin} />
                </li>
              ))}
            </ul>
          )}

          <p className="text-[0.7rem] leading-relaxed text-eu-muted">
            Facility data{" "}
            <a
              href={phase.data.attribution.url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-dotted underline-offset-2 text-eu-red-deep"
            >
              {phase.data.attribution.text}
            </a>{" "}
            · {phase.data.attribution.licence}. Live from {phase.data.sources.geocoder} and{" "}
            {phase.data.sources.directory}. Coordinates are kept only for this search.
          </p>
        </div>
      ) : null}
    </EuCard>
  );
}

/**
 * One nearby facility.
 *
 * Identity and honesty on the top row, the facts OpenStreetMap published in the
 * middle, and Call / Directions actions at the bottom. A facility without a
 * phone number says so rather than showing an invented one.
 */
function NearbyFacilityRow({
  facility,
  origin,
}: {
  facility: Facility;
  origin: [number, number] | null;
}) {
  const distance = formatFacilityDistance(facility.distanceMeters);
  const title = facility.name ?? facility.address ?? "Healthcare facility (name not recorded in OpenStreetMap)";
  const locality = [facility.city, facility.district, facility.state, facility.postalCode]
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)
    .join(", ");
  const callHref = telHref(facility.phone);
  const mapHref = directionsUrl(
    { coordinates: [facility.latitude, facility.longitude], address: facility.address, name: title },
    origin,
  );

  return (
    <article className="rounded-2xl border border-eu-border bg-eu-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-eu-text">{title}</span>
            <span className="rounded-full border border-eu-border bg-eu-surface px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">
              Not verified by MEDIPAL
            </span>
            <span className="rounded-full border border-[#f6c9c1] bg-[#fdf0ed] px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-eu-red-deep">
              {FACILITY_KIND_LABEL[facility.kind]}
            </span>
            {facility.emergency ? (
              <span className="rounded-full border border-[#bfe3ce] bg-[#eefaf2] px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-eu-ok">
                Emergency recorded
              </span>
            ) : null}
          </p>
          {facility.address && facility.address !== title ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-[0.78rem] leading-relaxed text-eu-muted">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {facility.address}
            </p>
          ) : null}
          {locality ? (
            <p className="mt-1 text-[0.72rem] leading-relaxed text-eu-muted">{locality}</p>
          ) : null}
        </div>
        {distance ? (
          <span className="shrink-0 rounded-full border border-eu-border bg-eu-surface px-2.5 py-1 text-[0.72rem] font-medium text-eu-muted">
            {distance}
          </span>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-1.5 text-[0.78rem] leading-relaxed text-eu-muted">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="inline-flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Phone
          </dt>
          <dd>
            {callHref ? (
              <a href={callHref} className="font-medium text-eu-red-deep hover:underline">
                {facility.phone}
              </a>
            ) : (
              <span>Not published in OpenStreetMap</span>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="inline-flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5" aria-hidden />
            Services
          </dt>
          <dd>OpenStreetMap publishes no service list for this place — confirm with the facility.</dd>
        </div>
      </dl>

      <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
        {callHref ? (
          <a href={callHref} className="eu-btn eu-btn-primary justify-center gap-2 px-3.5 py-2 text-[0.8rem]">
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Call
          </a>
        ) : (
          <span
            aria-disabled
            className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-eu-border bg-eu-surface px-3.5 py-2 text-[0.8rem] text-eu-muted"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Phone number unavailable
          </span>
        )}
        {mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer noopener"
            className="eu-btn eu-btn-secondary justify-center gap-2 px-3.5 py-2 text-[0.8rem]"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden />
            Directions
          </a>
        ) : (
          <span
            aria-disabled
            className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-eu-border bg-eu-surface px-3.5 py-2 text-[0.8rem] text-eu-muted"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden />
            Location not published
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {facility.website ? (
          <a
            href={facility.website}
            target="_blank"
            rel="noreferrer noopener"
            className="eu-btn eu-btn-quiet gap-2 px-3.5 py-2 text-[0.8rem]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Website
          </a>
        ) : null}
        <a
          href={facility.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="eu-btn eu-btn-quiet gap-2 px-3.5 py-2 text-[0.8rem]"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Source record
        </a>
        <span className="text-[0.68rem] leading-relaxed text-eu-muted">
          Coordinates {facility.latitude.toFixed(5)}, {facility.longitude.toFixed(5)}
        </span>
      </div>
    </article>
  );
}
