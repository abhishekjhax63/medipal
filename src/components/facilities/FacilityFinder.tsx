import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Building2,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  FACILITY_KIND_LABEL,
  RADIUS_OPTIONS_KM,
  facilityDirectionsUrl,
  formatFacilityDistance,
  type Facility,
  type FacilityKind,
  type FacilitySearchResponse,
} from "@/services/facilities/types";
import { FacilityApiError, currentPosition, facilityApi } from "@/services/facilities/api";

type Tone = "blood" | "eupchar";

type FinderState =
  | { kind: "idle" }
  | { kind: "loading"; label: string }
  | { kind: "ready"; data: FacilitySearchResponse; originLabel: string | null }
  | { kind: "error"; message: string; code: string };

export type FacilityFinderProps = {
  /** Visual register only — the data and behaviour are identical. */
  tone?: Tone;
  title?: string;
  description?: string;
  /** Facility kinds offered as filters. Defaults to the healthcare set. */
  kinds?: readonly FacilityKind[];
  /** Kinds pre-selected on first render. */
  initialKinds?: readonly FacilityKind[];
  initialRadiusKm?: number;
  limit?: number;
  className?: string;
  /** Copy shown above the results, e.g. the Blood Bank honesty notice. */
  notice?: string;
};

const DEFAULT_KINDS: readonly FacilityKind[] = [
  "hospital",
  "clinic",
  "blood_bank",
  "pharmacy",
  "doctors",
  "dentist",
];

const TONE: Record<
  Tone,
  {
    eyebrow: string;
    title: string;
    body: string;
    label: string;
    field: string;
    primary: string;
    secondary: string;
    quiet: string;
    chip: string;
    chipActive: string;
    card: string;
    cardTitle: string;
    muted: string;
    accent: string;
    soft: string;
    notice: string;
  }
> = {
  blood: {
    eyebrow: "eyebrow",
    title: "font-display text-2xl font-semibold tracking-[-0.02em] text-content-primary sm:text-[1.7rem]",
    body: "text-sm leading-relaxed text-content-secondary",
    label: "field-label",
    field: "field",
    primary: "btn-primary",
    secondary: "btn-secondary",
    quiet: "btn-secondary",
    chip: "rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-crimson/30 hover:text-crimson-soft",
    chipActive: "rounded-full border border-crimson/35 bg-blush px-3.5 py-1.5 text-xs font-semibold text-crimson-soft",
    card: "rounded-2xl border border-line bg-white/70 p-4 backdrop-blur-md",
    cardTitle: "font-display text-sm font-semibold text-content-primary",
    muted: "text-content-secondary",
    accent: "text-crimson-soft",
    soft: "border-line bg-white/70",
    notice: "border-line bg-blush-soft text-content-secondary",
  },
  eupchar: {
    eyebrow: "eu-eyebrow",
    title: "text-xl font-semibold tracking-[-0.01em] text-eu-text",
    body: "text-[0.85rem] leading-relaxed text-eu-muted",
    label: "eu-label",
    field: "eu-field",
    primary: "eu-btn eu-btn-primary",
    secondary: "eu-btn eu-btn-secondary",
    quiet: "eu-btn eu-btn-quiet",
    chip: "eu-chip border-eu-border bg-eu-bg text-eu-muted",
    chipActive: "eu-chip border-eu-red bg-[#fdf0ed] font-semibold text-eu-red-deep",
    card: "rounded-2xl border border-eu-border bg-eu-bg p-4",
    cardTitle: "text-sm font-semibold text-eu-text",
    muted: "text-eu-muted",
    accent: "text-eu-red-deep",
    soft: "border-eu-border bg-eu-surface",
    notice: "border-eu-border bg-eu-surface text-eu-muted",
  },
};

/** A short "just now / 4 min ago" label for the retrieval timestamp. */
function fetchedLabel(value: string): string {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return "time not recorded";
  const seconds = Math.round((Date.now() - parsed) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Live healthcare facility search (OpenStreetMap).
 *
 * This is the real-data search used by both the Blood Bank and the E-UPCHAR
 * sections. It shows only what the source publishes: a facility with no phone
 * number is shown as having no phone number, never with an invented one.
 *
 * Deliberate honesty boundary: appearing in this list means a *place exists on
 * the map*. It is not a statement that the facility operates a blood bank, holds
 * any blood group, offers a particular service, or has a doctor available.
 */
export function FacilityFinder({
  tone = "blood",
  title = "Find real hospitals & blood services near you",
  description = "Live search over OpenStreetMap — real facility names, addresses, coordinates, phone numbers and websites exactly as contributors recorded them.",
  kinds = DEFAULT_KINDS,
  initialKinds = [],
  initialRadiusKm = 10,
  limit = 40,
  className,
  notice,
}: FacilityFinderProps) {
  const t = TONE[tone];
  const [query, setQuery] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<readonly FacilityKind[]>(initialKinds);
  const [radiusKm, setRadiusKm] = useState<number>(initialRadiusKm);
  const [sortBy, setSortBy] = useState<"distance" | "name">("distance");
  const [state, setState] = useState<FinderState>({ kind: "idle" });
  const [directoryNote, setDirectoryNote] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const lastSearchRef = useRef<{ query?: string; latitude?: number; longitude?: number } | null>(null);

  // Confirm the directory is actually reachable before blaming the user's input.
  useEffect(() => {
    const controller = new AbortController();
    facilityApi
      .status(controller.signal)
      .then((status) => {
        setDirectoryNote(
          status.status === "live"
            ? null
            : "The facility directory reports itself as not configured on this deployment.",
        );
      })
      .catch(() => {
        setDirectoryNote("MEDIPAL could not confirm the facility directory status.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const runSearch = useCallback(
    async (input: { query?: string; latitude?: number; longitude?: number }, label: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      lastSearchRef.current = input;

      // A hung provider must not leave the panel spinning forever. This sits
      // just above the server's own Overpass deadline, so the browser only gives
      // up once the server has genuinely run out of its retry budget.
      const timeout = window.setTimeout(() => controller.abort(), 95_000);
      setState({ kind: "loading", label });

      try {
        const data = await facilityApi.search(
          {
            ...input,
            radiusKm,
            types: selectedKinds,
            sortBy,
            limit,
          },
          controller.signal,
        );
        if (controllerRef.current !== controller) return;
        setState({ kind: "ready", data, originLabel: data.areaLabel });
      } catch (error) {
        if (controllerRef.current !== controller) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          setState({
            kind: "error",
            message:
              "The public OpenStreetMap directory is heavily loaded and did not answer in time. Please try again in a moment.",
            code: "TIMEOUT",
          });
          return;
        }
        if (error instanceof FacilityApiError) {
          setState({ kind: "error", message: error.message, code: error.code });
          return;
        }
        setState({
          kind: "error",
          message: "MEDIPAL could not complete that search. Please try again.",
          code: "UNKNOWN",
        });
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [limit, radiusKm, selectedKinds, sortBy],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setState({
        kind: "error",
        message: "Enter a city, area or 6-digit PIN code — or use “Near me”.",
        code: "AREA_REQUIRED",
      });
      return;
    }
    void runSearch({ query: trimmed }, `Searching around ${trimmed}…`);
  };

  const handleLocate = async () => {
    setState({ kind: "loading", label: "Getting your location…" });
    let position: GeolocationPosition;
    try {
      position = await currentPosition();
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof FacilityApiError
            ? error.message
            : "Your device could not provide a location. Enter a place manually.",
        code: error instanceof FacilityApiError ? error.code : "POSITION_UNAVAILABLE",
      });
      return;
    }

    const { latitude, longitude } = position.coords;
    // The label is cosmetic: if reverse geocoding fails the search still runs.
    void facilityApi
      .reverse(latitude, longitude)
      .then((place) => {
        setState((current) =>
          current.kind === "ready" && current.originLabel === null
            ? { ...current, originLabel: place.formatted }
            : current,
        );
      })
      .catch(() => undefined);

    await runSearch({ latitude, longitude }, "Finding facilities around your location…");
  };

  const retry = () => {
    const last = lastSearchRef.current;
    if (!last) return;
    void runSearch(last, "Searching again…");
  };

  const toggleKind = (kind: FacilityKind) =>
    setSelectedKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );

  return (
    <div className={cn(className)}>
      <p className={t.eyebrow}>{tone === "blood" ? "Live facility directory" : "E-UPCHAR · Live search"}</p>
      <h3 className={cn("mt-3", t.title)}>{title}</h3>
      <p className={cn("mt-3 max-w-3xl", t.body)}>{description}</p>
      {notice ? (
        <p
          className={cn(
            "mt-4 flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs leading-relaxed",
            t.notice,
          )}
        >
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {notice}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[1.7fr_auto] sm:items-end">
          <div>
            <label className={t.label} htmlFor={`facility-place-${tone}`}>
              City, area or PIN code
            </label>
            <div className="relative">
              <Search className={cn("pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2", t.muted)} aria-hidden />
              <input
                id={`facility-place-${tone}`}
                className={cn(t.field, "pl-11")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. Patna, Kankarbagh or 800020"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="submit" className={cn(t.primary, "gap-2 px-4 py-2.5")}>
              <Search className="h-4 w-4" aria-hidden />
              Search
            </button>
            <button type="button" onClick={() => void handleLocate()} className={cn(t.secondary, "gap-2 px-4 py-2.5")}>
              <LocateFixed className="h-4 w-4" aria-hidden />
              Near me
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={t.label} htmlFor={`facility-radius-${tone}`}>
              Search radius
            </label>
            <select
              id={`facility-radius-${tone}`}
              className={t.field}
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value))}
            >
              {RADIUS_OPTIONS_KM.map((option) => (
                <option key={option} value={option}>
                  Within {option} km
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={t.label} htmlFor={`facility-sort-${tone}`}>
              Order results by
            </label>
            <select
              id={`facility-sort-${tone}`}
              className={t.field}
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "distance" | "name")}
            >
              <option value="distance">Nearest first</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </div>
        </div>

        <div>
          <span className={t.label}>Facility type</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedKinds([])}
              aria-pressed={selectedKinds.length === 0}
              className={selectedKinds.length === 0 ? t.chipActive : t.chip}
            >
              Any type
            </button>
            {kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => toggleKind(kind)}
                aria-pressed={selectedKinds.includes(kind)}
                className={selectedKinds.includes(kind) ? t.chipActive : t.chip}
              >
                {FACILITY_KIND_LABEL[kind]}
              </button>
            ))}
          </div>
        </div>
      </form>

      <div className="mt-7">
        {state.kind === "idle" ? (
          <p className={cn("flex items-start gap-2.5 rounded-2xl border px-4 py-3.5 text-sm leading-relaxed", t.notice)}>
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Enter a place or use “Near me”. MEDIPAL shows the real facilities OpenStreetMap holds for
              that area. Fields the source does not publish stay empty — they are never filled in with a
              guess.
              {directoryNote ? ` ${directoryNote}` : ""}
            </span>
          </p>
        ) : null}

        {state.kind === "loading" ? (
          <p className={cn("flex items-center gap-3 text-sm", t.muted)} aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {state.label}
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3.5", t.notice)}>
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-crimson" aria-hidden />
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", tone === "blood" ? "text-content-primary" : "text-eu-text")}>
                The facility search could not complete
              </p>
              <p className={cn("mt-1.5 text-sm leading-relaxed", t.muted)}>{state.message}</p>
              <p className={cn("mt-2 text-[0.7rem] uppercase tracking-[0.16em]", t.muted)}>
                Code {state.code}
              </p>
              {lastSearchRef.current ? (
                <button type="button" onClick={retry} className={cn(t.quiet, "mt-3 gap-2 px-3.5 py-2 text-[0.8rem]")}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Try again
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <div aria-live="polite" className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={cn("flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-[0.2em]", t.muted)}>
                <Navigation className="h-3.5 w-3.5" aria-hidden />
                {state.originLabel ? `Near ${state.originLabel}` : "Near the selected point"}
              </p>
              <span className={cn("text-[0.7rem] uppercase tracking-[0.16em]", t.muted)}>
                {state.data.facilities.length} shown
                {state.data.totalMatching > state.data.facilities.length
                  ? ` of ${state.data.totalMatching} matching`
                  : ""}
                {" · "}
                {state.data.radiusMeters / 1000} km radius
              </span>
            </div>

            {state.data.facilities.length === 0 ? (
              <p className={cn("rounded-2xl border px-4 py-3.5 text-sm leading-relaxed", t.notice)}>
                OpenStreetMap holds no matching healthcare facility inside {state.data.radiusMeters / 1000} km
                of that point. That is what the source contains — MEDIPAL will not fill the list with
                facilities it cannot verify. Try a larger radius or a nearby larger town.
              </p>
            ) : (
              <ul className="grid gap-3">
                {state.data.facilities.map((facility) => (
                  <li key={facility.id}>
                    <FacilityRow facility={facility} tone={tone} />
                  </li>
                ))}
              </ul>
            )}

            <p className={cn("text-[0.7rem] leading-relaxed", t.muted)}>
              Facility data{" "}
              <a
                href={state.data.attribution.url}
                target="_blank"
                rel="noreferrer noopener"
                className={cn("underline decoration-dotted underline-offset-2", t.accent)}
              >
                {state.data.attribution.text}
              </a>{" "}
              · {state.data.attribution.licence}. Retrieved live {fetchedLabel(state.data.fetchedAt)} from{" "}
              {state.data.sources.geocoder} and {state.data.sources.directory}.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FacilityRow({ facility, tone }: { facility: Facility; tone: Tone }) {
  const t = TONE[tone];
  const distance = formatFacilityDistance(facility.distanceMeters);
  const title = facility.name ?? facility.address ?? "Healthcare facility (name not recorded in OpenStreetMap)";
  const locality = [facility.city, facility.district, facility.state, facility.postalCode]
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)
    .join(", ");

  return (
    <article className={t.card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={t.cardTitle}>{title}</span>
            <span className={cn("rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em]", t.soft, t.accent)}>
              {FACILITY_KIND_LABEL[facility.kind]}
            </span>
            {facility.emergency ? (
              <span className="rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ok">
                Emergency recorded
              </span>
            ) : null}
          </p>
          {facility.address && facility.address !== title ? (
            <p className={cn("mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed", t.muted)}>
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {facility.address}
            </p>
          ) : null}
          {locality ? (
            <p className={cn("mt-1 text-[0.7rem] leading-relaxed", t.muted)}>{locality}</p>
          ) : null}
        </div>
        {distance ? (
          <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium", t.soft, t.muted)}>
            {distance}
          </span>
        ) : null}
      </div>

      <dl className={cn("mt-3 grid gap-1.5 text-xs leading-relaxed", t.muted)}>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="inline-flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Phone
          </dt>
          <dd>
            {facility.phone ? (
              <a href={`tel:${facility.phone}`} className={cn("font-medium hover:underline", t.accent)}>
                {facility.phone}
              </a>
            ) : (
              <span>Not published in OpenStreetMap</span>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Opening hours
          </dt>
          <dd>{facility.openingHours ? <span>{facility.openingHours}</span> : <span>Not published in OpenStreetMap</span>}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="inline-flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            Coordinates
          </dt>
          <dd className="tabular-nums">
            {facility.latitude.toFixed(5)}, {facility.longitude.toFixed(5)}
          </dd>
        </div>
      </dl>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <a
          href={facilityDirectionsUrl(facility)}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(t.primary, "gap-2 px-3.5 py-2 text-[0.8rem]")}
        >
          <Navigation className="h-3.5 w-3.5" aria-hidden />
          Directions
        </a>
        {facility.phone ? (
          <a href={`tel:${facility.phone}`} className={cn(t.secondary, "gap-2 px-3.5 py-2 text-[0.8rem]")}>
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Call
          </a>
        ) : null}
        {facility.website ? (
          <a
            href={facility.website}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(t.secondary, "gap-2 px-3.5 py-2 text-[0.8rem]")}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden />
            Website
          </a>
        ) : null}
        <a
          href={facility.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(t.quiet, "gap-2 px-3.5 py-2 text-[0.8rem]")}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Source record
        </a>
      </div>

      {facility.kind === "blood_bank" ? (
        <p className={cn("mt-3 flex items-start gap-2 text-[0.72rem] leading-relaxed", t.muted)}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Blood availability has not been verified. Please contact the facility.
        </p>
      ) : null}
    </article>
  );
}
