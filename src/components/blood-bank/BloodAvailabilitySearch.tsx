import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Building2,
  Clock,
  DatabaseZap,
  Info,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Navigation,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { indianStates, type BloodGroup } from "@/data/bloodGroups";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/cn";
import {
  FRESHNESS_BASIS_LABEL,
  FRESHNESS_EXPLANATION,
  FRESHNESS_LABEL,
  FRESHNESS_TONE,
  absoluteTime,
  dataSourceLabel,
  formatDistance,
  relativeTime,
} from "@/lib/blood/presentation";
import { parseBloodQuery, type ParsedBloodQuery } from "@/lib/blood/voice";
import { geoApi } from "@/services/geo";
import { BloodApiError, bloodApi } from "@/services/blood/api";
import { BLOOD_COMPONENTS } from "@/services/blood/types";
import type { AvailabilityResponse, AvailabilityRow, BloodComponent } from "@/services/blood/types";

type FreshnessFilter = "all" | "verified_only" | "exclude_stale";
type SortBy = "distance" | "freshness" | "quantity";

type Filters = {
  bloodGroup: BloodGroup | "";
  component: BloodComponent | "";
  state: string;
  city: string;
  postalCode: string;
  freshness: FreshnessFilter;
  sortBy: SortBy;
};

/** A listing from the maps provider — a real place, but with no stock figures. */
type DirectoryListing = {
  id: string | null;
  name: string | null;
  address: string | null;
  categories: string[];
  distanceMeters: number | null;
  phone: string | null;
  kind?: "blood_service" | "facility";
};

type Area = { latitude: number; longitude: number; formatted: string };

/** A search origin obtained from the device, used instead of a typed place name. */
type SearchOrigin = { latitude: number; longitude: number; label: string };

/**
 * The state of the "use my current location" control. Location is requested
 * only when the person presses the button — never on mount — so the idle state
 * is the honest default.
 */
type GeoState =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "ready"; label: string }
  | { kind: "denied" }
  | { kind: "unavailable" };

type SearchState =
  | { kind: "idle" }
  | { kind: "loading"; filters: Filters }
  | {
      kind: "ready";
      filters: Filters;
      response: AvailabilityResponse;
      directory: DirectoryListing[];
      area: Area | null;
      /** Set when the maps lookup itself failed; the registry results still stand. */
      directoryNote: string | null;
    }
  | { kind: "error"; filters: Filters; message: string; code: string };

const EMPTY_FILTERS: Filters = {
  bloodGroup: "",
  component: "",
  state: "",
  city: "",
  postalCode: "",
  freshness: "all",
  sortBy: "distance",
};

const FRESHNESS_FILTER_OPTIONS: readonly { value: FreshnessFilter; label: string }[] = [
  { value: "all", label: "Show every facility" },
  { value: "exclude_stale", label: "Hide facilities with no recent confirmation" },
  { value: "verified_only", label: "Only facilities that reported in the last few hours" },
];

const SORT_OPTIONS: readonly { value: SortBy; label: string }[] = [
  { value: "distance", label: "Nearest first" },
  { value: "freshness", label: "Most recently reported first" },
  { value: "quantity", label: "Largest reported quantity first" },
];

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center gap-2 rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-xs text-content-secondary backdrop-blur-md">
      <span className="uppercase tracking-[0.16em] text-content-secondary/70">{label}</span>
      <span className="font-medium text-content-primary">{value}</span>
    </li>
  );
}

function FreshnessBadge({ status }: { status: AvailabilityRow["freshnessStatus"] }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em]",
        FRESHNESS_TONE[status],
      )}
    >
      {FRESHNESS_LABEL[status]}
    </span>
  );
}

/**
 * Availability search.
 *
 * Two genuinely different sources are shown side by side, and they are never
 * blended:
 *
 *  1. The MEDIPAL registry — stock figures that approved facilities have
 *     actually reported, each carrying its freshness, last-updated timestamp
 *     and provenance.
 *  2. A maps-provider directory of real hospitals and blood banks, which says
 *     where blood services are but holds no stock information at all.
 *
 * Neither is fabricated. When the registry has nothing, the panel says so
 * rather than substituting an estimate.
 */
export function BloodAvailabilitySearch() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [voiceReadback, setVoiceReadback] = useState<ParsedBloodQuery | null>(null);
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });

  const filtersRef = useRef(filters);
  const appliedVoice = useRef(false);

  const voice = useVoiceInput("en-IN");

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const runSearch = useCallback(async (snapshot: Filters, origin?: SearchOrigin) => {
    const city = snapshot.city.trim();
    const stateName = snapshot.state.trim();
    const pin = snapshot.postalCode.trim();

    if (!origin && !city && !stateName && !pin) {
      setState({
        kind: "error",
        filters: snapshot,
        message:
          "Enter a city, a state or a PIN code so MEDIPAL knows where to look. Blood availability is always local.",
        code: "AREA_REQUIRED",
      });
      return;
    }

    setState({ kind: "loading", filters: snapshot });

    // The maps lookup runs first so its coordinates can be handed to the
    // registry query, which turns distances from null into real kilometres.
    // When the device supplied a coordinate directly, that is the origin and
    // the typed place names are not needed to find the area.
    let area: Area | null = origin
      ? { latitude: origin.latitude, longitude: origin.longitude, formatted: origin.label }
      : null;
    let directory: DirectoryListing[] = [];
    let directoryNote: string | null = null;
    if (origin || city || stateName) {
      try {
        const nearby = await bloodApi.nearby(
          origin
            ? { lat: origin.latitude, lng: origin.longitude }
            : { ...(city ? { city } : {}), ...(stateName ? { state: stateName } : {}) },
        );
        // A device coordinate is more precise than a geocoded place name, so
        // keep it; only borrow the provider's label when we have none.
        area = origin
          ? { latitude: origin.latitude, longitude: origin.longitude, formatted: nearby.area?.formatted || origin.label }
          : nearby.area ?? null;
        directory = Array.isArray(nearby.facilities) ? nearby.facilities : [];
      } catch (error) {
        directoryNote =
          error instanceof BloodApiError
            ? error.message
            : "The maps directory could not be reached, so only reported stock is shown.";
      }
    } else {
      directoryNote = "A PIN code alone cannot be placed on the map, so no directory lookup was made.";
    }

    try {
      const response = await bloodApi.availability({
        ...(snapshot.bloodGroup ? { bloodGroup: snapshot.bloodGroup } : {}),
        ...(snapshot.component ? { component: snapshot.component } : {}),
        ...(stateName ? { state: stateName } : {}),
        ...(city ? { city } : {}),
        ...(pin ? { postalCode: pin } : {}),
        ...(area ? { lat: area.latitude, lng: area.longitude } : {}),
        freshness: snapshot.freshness,
        sortBy: snapshot.sortBy,
      });
      setState({ kind: "ready", filters: snapshot, response, directory, area, directoryNote });
    } catch (error) {
      if (error instanceof BloodApiError) {
        setState({ kind: "error", filters: snapshot, message: error.message, code: error.code });
        return;
      }
      setState({
        kind: "error",
        filters: snapshot,
        message: "MEDIPAL could not complete that search. Check your connection and try again.",
        code: "UNKNOWN",
      });
    }
  }, []);

  // When the microphone session ends, apply whatever was actually heard.
  useEffect(() => {
    if (voice.listening) {
      appliedVoice.current = false;
      return;
    }
    if (appliedVoice.current) return;
    const heard = voice.transcript.trim();
    if (!heard) return;
    appliedVoice.current = true;

    const parsed = parseBloodQuery(heard);
    setVoiceReadback(parsed);

    const next: Filters = {
      ...filtersRef.current,
      ...(parsed.bloodGroup ? { bloodGroup: parsed.bloodGroup } : {}),
      ...(parsed.component ? { component: parsed.component } : {}),
      ...(parsed.state ? { state: parsed.state } : {}),
      ...(parsed.city ? { city: parsed.city } : {}),
      ...(parsed.postalCode ? { postalCode: parsed.postalCode } : {}),
    };
    setFilters(next);
    filtersRef.current = next;

    if (parsed.bloodGroup || parsed.state || parsed.city || parsed.postalCode) {
      void runSearch(next);
    }
  }, [voice.listening, voice.transcript, runSearch]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch({ ...filters });
  };

  const handleClear = () => {
    setFilters(EMPTY_FILTERS);
    filtersRef.current = EMPTY_FILTERS;
    setState({ kind: "idle" });
    setVoiceReadback(null);
    voice.reset();
  };

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  /**
   * Location is requested here and nowhere else — never on mount, never in the
   * background. A refusal is not an error state: it simply means the person
   * searches by state, city or PIN instead, which the form below still allows.
   */
  const handleUseMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ kind: "unavailable" });
      return;
    }

    setGeo({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        // The place label is cosmetic and only used in the "near …" line.
        // A failure here must not stop the search — the coordinate is enough.
        let label = "your current location";
        try {
          const place = await geoApi.reverseGeocode(latitude, longitude);
          if (place.formatted) label = place.formatted;
        } catch {
          label = "your current location";
        }

        setGeo({ kind: "ready", label });
        void runSearch(filtersRef.current, { latitude, longitude, label });
      },
      (error) => {
        // 1 = permission denied, 2 = position unavailable, 3 = timeout.
        setGeo({ kind: error.code === 1 ? "denied" : "unavailable" });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, [runSearch]);

  const activeFilters = state.kind === "ready" || state.kind === "error" ? state.filters : null;
  const busy = state.kind === "loading";

  return (
    <section id="availability-search" className="section-shell section-pad scroll-mt-28">
      <SectionHeading
        as="h1"
        eyebrow="Search blood by location"
        title="Find Blood Near You"
        description="Search verified blood centres by location and blood group. Two sources are shown separately and never mixed — stock that approved facilities have actually reported to MEDIPAL, and a maps directory of real hospitals and blood banks — and every figure says where it came from and when it was last reported."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-[0.95fr_1fr] lg:gap-8">
        <GlassCard hairline interactive={false} className="p-7 sm:p-9">
          <form onSubmit={handleSubmit} className="grid gap-5">
            {/* Location first: the fastest way in, and the only place the
                browser's position is ever requested. */}
            <div className="rounded-2xl border border-brand-tint bg-brand-wash p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleUseMyLocation}
                  disabled={geo.kind === "locating" || busy}
                >
                  {geo.kind === "locating" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Navigation className="h-4 w-4" aria-hidden />
                  )}
                  {geo.kind === "locating" ? "Finding your location…" : "Use my current location"}
                </button>
                <p className="min-w-[12rem] flex-1 text-xs leading-relaxed text-content-secondary">
                  Your browser is asked for your position only when you press this button, and never
                  in the background.
                </p>
              </div>

              {geo.kind === "ready" ? (
                <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-content-secondary">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
                  Searching near {geo.label}.
                </p>
              ) : null}

              {geo.kind === "denied" ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs leading-relaxed text-content-secondary">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-secondary" aria-hidden />
                  Your location has not been shared. Nothing was detected. You can still search by
                  state, city or PIN code below.
                </p>
              ) : null}

              {geo.kind === "unavailable" ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs leading-relaxed text-content-secondary">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                  Your device could not provide a location. Search by state, city or PIN code
                  instead.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" aria-hidden />
              <span className="text-xs font-medium text-content-secondary">
                or search by area
              </span>
              <span className="h-px flex-1 bg-line" aria-hidden />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="availability-group">
                  Blood group
                </label>
                <select
                  id="availability-group"
                  className="field"
                  value={filters.bloodGroup}
                  onChange={(event) => set("bloodGroup", event.target.value as BloodGroup | "")}
                >
                  <option value="">Any blood group</option>
                  {(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const).map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="availability-component">
                  Component
                </label>
                <select
                  id="availability-component"
                  className="field"
                  value={filters.component}
                  onChange={(event) => set("component", event.target.value as BloodComponent | "")}
                >
                  <option value="">Any component</option>
                  {BLOOD_COMPONENTS.map((component) => (
                    <option key={component} value={component}>
                      {component}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="availability-state">
                  State
                </label>
                <input
                  id="availability-state"
                  type="text"
                  list="availability-state-options"
                  autoComplete="address-level1"
                  className="field"
                  placeholder="e.g. Bihar"
                  value={filters.state}
                  onChange={(event) => set("state", event.target.value)}
                />
                <datalist id="availability-state-options">
                  {indianStates.map((state) => (
                    <option key={state} value={state} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="field-label" htmlFor="availability-city">
                  City or district
                </label>
                <input
                  id="availability-city"
                  type="text"
                  autoComplete="address-level2"
                  className="field"
                  placeholder="e.g. Patna"
                  value={filters.city}
                  onChange={(event) => set("city", event.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="availability-pin">
                PIN code <span className="normal-case tracking-normal text-content-secondary/60">(optional)</span>
              </label>
              <input
                id="availability-pin"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="postal-code"
                className="field"
                placeholder="6-digit PIN"
                value={filters.postalCode}
                onChange={(event) => set("postalCode", event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="availability-freshness">
                  Freshness
                </label>
                <select
                  id="availability-freshness"
                  className="field"
                  value={filters.freshness}
                  onChange={(event) => set("freshness", event.target.value as FreshnessFilter)}
                >
                  {FRESHNESS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="availability-sort">
                  Order results by
                </label>
                <select
                  id="availability-sort"
                  className="field"
                  value={filters.sortBy}
                  onChange={(event) => set("sortBy", event.target.value as SortBy)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Voice input — rendered only when the browser really supports it. */}
            {voice.supported ? (
              <div className="rounded-2xl border border-line bg-white/70 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={cn("btn-secondary", voice.listening && "border-crimson/40 text-crimson-soft")}
                    onClick={() => (voice.listening ? voice.stop() : voice.start())}
                    aria-pressed={voice.listening}
                  >
                    {voice.listening ? (
                      <>
                        <MicOff className="h-4 w-4" aria-hidden />
                        Stop listening
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4" aria-hidden />
                        Speak your search
                      </>
                    )}
                  </button>
                  <p className="text-xs leading-relaxed text-content-secondary">
                    Say something like “O negative platelets in Patna”. Nothing is sent until you
                    search.
                  </p>
                </div>

                {voice.listening || voice.transcript ? (
                  <p className="mt-3 rounded-xl border border-line bg-blush-soft px-3 py-2 text-xs leading-relaxed text-content-primary">
                    <span className="uppercase tracking-[0.16em] text-content-secondary">Heard </span>
                    {voice.transcript.trim() || "…"}
                  </p>
                ) : null}

                {voice.error ? (
                  <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-crimson-soft">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {voice.error}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="flex items-start gap-2.5 rounded-2xl border border-line bg-blush-soft px-4 py-3 text-xs leading-relaxed text-content-secondary">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
                Voice search is not available in this browser, so the microphone is hidden rather
                than shown as a control that cannot work.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
                {busy ? "Searching…" : "Search"}
              </button>
              <button type="button" className="btn-secondary" onClick={handleClear}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Clear Filters
              </button>
            </div>
          </form>
        </GlassCard>

        <GlassCard interactive={false} className="flex flex-col p-7 sm:p-9">
          <ResultsHeader state={state} />

          <div className="divider-glass my-7" />

          <div className="flex-1">
            {state.kind === "idle" ? (
              <div className="flex h-full flex-col justify-center gap-4">
                <p className="flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-content-secondary">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  Interface ready
                </p>
                <p className="text-sm leading-relaxed text-content-secondary">
                  Enter a city, state or PIN to search. MEDIPAL shows stock figures that approved
                  facilities have reported, alongside a directory of real blood services nearby.
                  Always call a facility before you travel — a reported figure can change within
                  minutes.
                </p>
              </div>
            ) : null}

            {state.kind === "loading" ? (
              <div className="flex h-full items-center gap-3 text-sm text-content-secondary">
                <Loader2 className="h-4 w-4 animate-spin text-crimson-bright" aria-hidden />
                Checking reported stock and nearby blood services…
              </div>
            ) : null}

            {state.kind === "error" ? (
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-crimson-bright" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-content-primary">Search could not complete</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-content-secondary">{state.message}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-content-secondary/70">
                    Code {state.code}
                  </p>
                </div>
              </div>
            ) : null}

            {state.kind === "ready" ? (
              <div aria-live="polite" className="grid gap-7">
                {state.area ? (
                  <p className="flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-content-secondary">
                    <Navigation className="h-3.5 w-3.5" aria-hidden />
                    Near {state.area.formatted}
                  </p>
                ) : null}

                {activeFilters ? (
                  <ul className="flex flex-wrap gap-2">
                    <FilterChip label="Group" value={activeFilters.bloodGroup || "Any"} />
                    <FilterChip label="Component" value={activeFilters.component || "Any"} />
                    <FilterChip label="State" value={activeFilters.state.trim() || "Any"} />
                    <FilterChip label="City" value={activeFilters.city.trim() || "Any"} />
                    <FilterChip label="PIN" value={activeFilters.postalCode.trim() || "Any"} />
                  </ul>
                ) : null}

                {voiceReadback && voiceReadback.matched.length > 0 ? (
                  <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-blush-soft px-4 py-3 text-xs leading-relaxed text-content-secondary">
                    <Mic className="h-3.5 w-3.5 shrink-0 text-crimson" aria-hidden />
                    <span className="font-medium text-content-primary">Voice understood:</span>
                    {voiceReadback.matched.join(" · ")}
                  </p>
                ) : null}

                <RegistryBlock response={state.response} filters={state.filters} />
                <DirectoryBlock
                  directory={state.directory}
                  note={state.directoryNote}
                  hasFilter={Boolean(state.filters.bloodGroup || state.filters.component)}
                />
              </div>
            ) : null}
          </div>
        </GlassCard>
      </div>
    </section>
  );
}

function ResultsHeader({ state }: { state: SearchState }) {
  const copy = useMemo(() => {
    if (state.kind === "ready") {
      const withStock = state.response.counts.rowsWithStock;
      return {
        title: withStock
          ? `${withStock} reported stock ${withStock === 1 ? "entry" : "entries"} found.`
          : "No facility has reported stock matching this search.",
        body: withStock
          ? "These figures were reported by the facilities themselves. Confirm by phone before travelling — stock moves quickly and a report can be hours old."
          : "MEDIPAL does not estimate or guess stock. The directory below still shows real blood services you can call.",
      };
    }
    if (state.kind === "error") {
      return {
        title: "We could not complete that search.",
        body: "The message below explains why. No results were shown because none could be verified.",
      };
    }
    return {
      title: "Reported stock and real blood services.",
      body: "MEDIPAL separates what facilities have reported from where blood services simply are, so a number is never mistaken for a guarantee.",
    };
  }, [state]);

  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden
        className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-blush shadow-glow-red-sm"
      >
        <DatabaseZap className="h-6 w-6 text-crimson-bright" />
      </span>
      <div>
        <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-content-primary">
          {copy.title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-content-secondary">{copy.body}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Registry: stock a facility actually reported                        */
/* ------------------------------------------------------------------ */

function RegistryBlock({ response, filters }: { response: AvailabilityResponse; filters: Filters }) {
  const { counts, thresholds, results, truncated, generatedAt } = response;

  return (
    <section aria-label="Reported stock from approved facilities">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-display text-base font-semibold tracking-[-0.01em] text-content-primary">
          <ShieldCheck className="h-4 w-4 text-crimson" aria-hidden />
          Reported stock — MEDIPAL registry
        </h4>
        <span className="text-[0.7rem] uppercase tracking-[0.16em] text-content-secondary/70">
          {counts.approvedFacilitiesMatchingArea} approved{" "}
          {counts.approvedFacilitiesMatchingArea === 1 ? "facility" : "facilities"} in area
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-content-secondary">
        “Recently confirmed” means a facility reported within the last {thresholds.RECENT_HOURS} hours.
        Between {thresholds.RECENT_HOURS} and {thresholds.UPDATE_DUE_HOURS} hours a report is marked
        “update due”; beyond that MEDIPAL shows no figure at all.
      </p>

      {results.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-line bg-white/70 px-4 py-3.5 text-sm leading-relaxed text-content-secondary">
          {counts.approvedFacilitiesMatchingArea === 0
            ? "No approved facility has registered with MEDIPAL in this area yet. Facilities appear here only after a MEDIPAL reviewer approves them and they report stock."
            : "Approved facilities exist in this area, but none has reported stock matching this search. That means “not reported”, not “unavailable” — call them directly."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {results.map((row) => (
            <RegistryRow
              key={`${row.facility.id}-${row.bloodGroup ?? "any"}-${row.component ?? "any"}`}
              row={row}
              showGroup={!filters.bloodGroup}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs leading-relaxed text-content-secondary/80">
        {truncated ? "Showing the first results only — narrow your search to see more. " : ""}
        Generated {absoluteTime(generatedAt)} ({relativeTime(generatedAt)}).
      </p>
    </section>
  );
}

function RegistryRow({ row, showGroup }: { row: AvailabilityRow; showGroup: boolean }) {
  const distance = formatDistance(row.distanceKm);
  const { facility } = row;

  return (
    <li className="rounded-2xl border border-line bg-white/70 p-4 backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-content-primary">
            {facility.name}
            {distance ? (
              <span className="rounded-full border border-line bg-white/80 px-2 py-0.5 text-[0.65rem] font-medium text-content-secondary">
                {distance}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-content-secondary">
            {[facility.category, facility.city, facility.state].filter(Boolean).join(" · ")}
          </p>
        </div>
        <FreshnessBadge status={row.freshnessStatus} />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
        {showGroup && row.bloodGroup ? (
          <span className="font-display text-lg font-semibold text-crimson-soft">{row.bloodGroup}</span>
        ) : null}
        <span className="text-sm text-content-primary">
          <span className="font-display text-lg font-semibold">{row.availableQuantity}</span>{" "}
          <span className="text-content-secondary">{row.unit?.toLowerCase() ?? "units"}</span>
          {row.component ? ` of ${row.component}` : ""}
        </span>
        {row.batchCount > 0 ? (
          <span className="text-xs text-content-secondary">
            across {row.batchCount} {row.batchCount === 1 ? "batch" : "batches"}
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-secondary">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {row.lastUpdatedAt
            ? `Reported ${relativeTime(row.lastUpdatedAt)} — ${absoluteTime(row.lastUpdatedAt)}`
            : "No report for this group and component"}
        </span>
        {row.nearestExpiryDate ? <span>Nearest expiry {row.nearestExpiryDate}</span> : null}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-content-secondary/85">
        {FRESHNESS_EXPLANATION[row.freshnessStatus]}{" "}
        <span className="text-content-secondary/70">
          Basis: {FRESHNESS_BASIS_LABEL[row.freshnessBasis] ?? row.freshnessBasis}.
        </span>
      </p>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] leading-relaxed text-content-secondary/80">
        <span className="rounded-full border border-line bg-blush-soft px-2 py-0.5">
          {dataSourceLabel(row.dataSourceId)}
        </span>
        {row.sourceNote ? <span>{row.sourceNote}</span> : null}
      </p>

      {facility.phone ? (
        <a
          href={`tel:${facility.phone}`}
          className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-crimson-soft hover:underline"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
          {facility.phone}
        </a>
      ) : (
        <p className="mt-3 text-xs text-content-secondary/80">
          No phone number published for this facility.
        </p>
      )}
      {facility.emergencyHotline ? (
        <a
          href={`tel:${facility.emergencyHotline}`}
          className="ml-4 mt-3 inline-flex items-center gap-2 text-xs font-medium text-crimson-soft hover:underline"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
          Emergency {facility.emergencyHotline}
        </a>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Directory: where blood services are, with no stock claim            */
/* ------------------------------------------------------------------ */

function DirectoryBlock({
  directory,
  note,
  hasFilter,
}: {
  directory: DirectoryListing[];
  note: string | null;
  hasFilter: boolean;
}) {
  return (
    <section aria-label="Nearby blood services from the maps directory">
      <h4 className="flex items-center gap-2 font-display text-base font-semibold tracking-[-0.01em] text-content-primary">
        <Building2 className="h-4 w-4 text-crimson" aria-hidden />
        Blood services nearby — maps directory
      </h4>

      <p className="mt-3 text-xs leading-relaxed text-content-secondary">
        Real hospitals and blood banks returned by the maps provider. This source publishes no stock
        at all, so no quantity is shown
        {hasFilter ? " — your blood group filter does not apply to this list." : "."}
      </p>

      {note ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-line bg-white/70 px-4 py-3 text-xs leading-relaxed text-content-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crimson" aria-hidden />
          {note}
        </p>
      ) : null}

      {directory.length === 0 ? (
        note ? null : (
          <p className="mt-4 rounded-2xl border border-line bg-white/70 px-4 py-3.5 text-sm leading-relaxed text-content-secondary">
            No blood-service listings were returned for this area. Try a nearby larger city, or call
            an authorised blood bank directly.
          </p>
        )
      ) : (
        <ul className="mt-4 space-y-3">
          {directory.map((listing, index) => (
            <DirectoryRow key={listing.id ?? `${listing.name ?? "listing"}-${index}`} listing={listing} />
          ))}
        </ul>
      )}

      {directory.length > 0 ? (
        <p className="mt-3 text-[0.7rem] leading-relaxed text-content-secondary/80">
          Listed from {dataSourceLabel("geoapify_directory")}. Presence in this list is not a
          statement that the facility operates a licensed blood bank.
        </p>
      ) : null}
    </section>
  );
}

function DirectoryRow({ listing }: { listing: DirectoryListing }) {
  const distance = formatDistance(
    typeof listing.distanceMeters === "number" ? listing.distanceMeters / 1000 : null,
  );
  const title = listing.name ?? listing.address ?? "Blood-service facility";

  return (
    <li className="rounded-2xl border border-line bg-white/70 p-4 backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-content-primary">
            {title}
            {listing.kind === "blood_service" ? (
              <span className="rounded-full border border-crimson/25 bg-blush px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crimson-soft">
                Blood service
              </span>
            ) : null}
          </p>
          {listing.address && listing.address !== title ? (
            <p className="mt-1 text-xs leading-relaxed text-content-secondary">{listing.address}</p>
          ) : null}
          {listing.categories.length > 0 ? (
            <p className="mt-1 text-[0.7rem] text-content-secondary/70">
              {listing.categories.slice(0, 3).join(" · ")}
            </p>
          ) : null}
        </div>
        {distance ? (
          <span className="shrink-0 rounded-full border border-line bg-white/80 px-2.5 py-1 text-[0.7rem] font-medium text-content-secondary">
            {distance}
          </span>
        ) : null}
      </div>

      {listing.phone ? (
        <a
          href={`tel:${listing.phone}`}
          className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-crimson-soft hover:underline"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
          {listing.phone}
        </a>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-xs text-content-secondary/80">
          <Phone className="h-3.5 w-3.5" aria-hidden />
          No phone published — search the facility name for contact details.
        </p>
      )}
    </li>
  );
}
