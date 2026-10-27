import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import {
  Phone,
  MapPin,
  Navigation,
  Loader2,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  Radio,
  Activity,
  ExternalLink,
  Send,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  bloodApi,
  liveStreamUrl,
  BloodApiError,
} from "@/services/blood/api";
import type {
  BiharDistrict,
  BloodHealthResponse,
  CentresResponse,
  LiveCentreRow,
  LiveStreamEvent,
  NearbyCentresResponse,
} from "@/services/blood/types";
import {
  LIVE_FRESHNESS_DOT,
  LIVE_FRESHNESS_EXPLANATION,
  LIVE_FRESHNESS_LABEL,
  LIVE_FRESHNESS_TONE,
  AVAILABILITY_STATUS_LABEL,
  absoluteTime,
  formatDistance,
  relativeTime,
} from "@/lib/blood/presentation";
import { LiveNotice, type LiveNoticeMessage } from "./LiveNotice";

const STATE = "Bihar";

/** Bihar centroid — used only to frame the map before any centre is known. */
const BIHAR_CENTER: L.LatLngExpression = [25.6, 85.1];
const DEFAULT_ZOOM = 7;
const FOCUS_ZOOM = 12;

const COMPONENTS = [
  "Packed Red Blood Cells",
  "Whole Blood",
  "Platelets",
  "Fresh Frozen Plasma",
  "Cryoprecipitate",
] as const;

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/** Stable identity for a centre × group × component figure. */
function grainOf(row: LiveCentreRow): string {
  return `${row.centreId}:${row.bloodGroup}:${row.component}`;
}

export function LiveFindBlood() {
  const reduceMotion = useReducedMotion();

  // ---- filters (§14) -------------------------------------------------------
  const [district, setDistrict] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [component, setComponent] = useState("");
  const [emergency, setEmergency] = useState(false);

  // ---- data ----------------------------------------------------------------
  const [districts, setDistricts] = useState<BiharDistrict[]>([]);
  const [rows, setRows] = useState<LiveCentreRow[]>([]);
  const [meta, setMeta] = useState<CentresResponse | NearbyCentresResponse | null>(null);
  const [health, setHealth] = useState<BloodHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<BloodApiError | null>(null);

  // ---- location ------------------------------------------------------------
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);

  // ---- live stream ---------------------------------------------------------
  const [streamState, setStreamState] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );
  const [recentlyChanged, setRecentlyChanged] = useState<Record<string, string>>({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [notice, setNotice] = useState<LiveNoticeMessage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markerIndexRef = useRef<Record<string, L.CircleMarker>>({});

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  /** The current query, as a stable value so the fetch effect can depend on it. */
  const load = useCallback(
    async (options: { silent?: boolean; signal?: AbortSignal } = {}) => {
      if (options.silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        if (origin) {
          // Coordinate search: the server ranks confirmed, recently reported
          // stock first and never presents a stale figure as confirmed.
          const [lon, lat] = [origin[1], origin[0]];
          void lon;
          const payload = await bloodApi.liveNearby(
            {
              latitude: lat,
              longitude: origin[1],
              bloodGroup: bloodGroup || undefined,
              component: component || undefined,
              radiusKm: 200,
              limit: 200,
            },
            options.signal,
          );
          setRows(payload.results);
          setMeta(payload);
        } else {
          const payload = await bloodApi.centres(
            {
              district: district || undefined,
              bloodGroup: bloodGroup || undefined,
              component: component || undefined,
              sortBy: emergency ? "emergency" : "priority",
              limit: 200,
            },
            options.signal,
          );
          setRows(payload.results);
          setMeta(payload);
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(
          caught instanceof BloodApiError
            ? caught
            : new BloodApiError(0, "The blood data service could not be reached.", "NETWORK_UNAVAILABLE"),
        );
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [origin, district, bloodGroup, component, emergency],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const loadHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      setHealth(await bloodApi.health(signal));
    } catch {
      /* the health panel simply stays as it was */
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadHealth(controller.signal);
    return () => controller.abort();
  }, [loadHealth]);

  useEffect(() => {
    const controller = new AbortController();
    bloodApi
      .districts({ state: STATE }, controller.signal)
      .then((payload) => setDistricts(payload.districts))
      .catch(() => setDistricts([]));
    return () => controller.abort();
  }, []);

  // ---------------------------------------------------------------------------
  // Realtime (§11-§13): a synced change is pushed, and the list is re-read so
  // the freshness verdict stays the server's decision, never the browser's.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setStreamState("offline");
      return;
    }
    const source = new EventSource(liveStreamUrl());

    source.onopen = () => setStreamState("live");
    source.onerror = () => setStreamState("connecting");

    source.onmessage = (event) => {
      let payload: LiveStreamEvent;
      try {
        payload = JSON.parse(event.data) as LiveStreamEvent;
      } catch {
        return;
      }
      setStreamState("live");

      if (payload.type === "inventory.change" && payload.facilityId && payload.bloodGroup && payload.component) {
        const key = `${payload.facilityId}:${payload.bloodGroup}:${payload.component}`;
        if (typeof payload.units === "number") {
          // Optimistically reflect the pushed number, then re-read so the
          // server re-issues the freshness verdict for the new observation.
          setRows((current) =>
            current.map((row) =>
              grainOf(row) === key
                ? {
                    ...row,
                    units: payload.units as number,
                    availabilityStatus: payload.availabilityStatus ?? row.availabilityStatus,
                    lastUpdatedAt: payload.sourceUpdatedAt ?? row.lastUpdatedAt,
                  }
                : row,
            ),
          );
        }
        setRecentlyChanged((current) => ({ ...current, [key]: payload.at }));
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => void load({ silent: true }), 700);
      }

      if (payload.type === "sync.completed" || payload.type === "sync.failed") {
        void loadHealth();
      }
    };

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      source.close();
    };
  }, [load, loadHealth]);

  // ---------------------------------------------------------------------------
  // Map
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: BIHAR_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markerIndexRef.current = {};
    };
  }, []);

  // Plot only centres that actually published coordinates. A centre without a
  // coordinate simply does not get a pin — no location is ever guessed.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    layer.clearLayers();
    markerIndexRef.current = {};

    for (const row of rows) {
      if (!row.coordinates) continue;
      const key = grainOf(row);
      const marker = L.circleMarker(row.coordinates, {
        radius: row.freshness === "LIVE" ? 9 : 7,
        color: "#E91E4D",
        weight: 2,
        fillColor: dotHex(row.freshness),
        fillOpacity: row.freshness === "UNKNOWN" ? 0.5 : 0.85,
      }).addTo(layer);

      marker.bindPopup(
        `<strong>${escapeHtml(row.name)}</strong><br/>` +
          `${escapeHtml(row.bloodGroup)} · ${escapeHtml(row.component)}<br/>` +
          `${row.units} ${escapeHtml(row.unit)} · ${escapeHtml(LIVE_FRESHNESS_LABEL[row.freshness])}`,
      );
      marker.on("click", () => setSelected(key));
      markerIndexRef.current[key] = marker;
    }

    if (rows.length > 0 && origin) {
      mapRef.current?.setView(origin, FOCUS_ZOOM);
    }
  }, [rows, origin]);

  useEffect(() => {
    if (!selected) return;
    const marker = markerIndexRef.current[selected];
    const row = rows.find((candidate) => grainOf(candidate) === selected);
    if (marker && row?.coordinates) {
      mapRef.current?.setView(row.coordinates, FOCUS_ZOOM);
      marker.openPopup();
    }
  }, [selected, rows]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setNotice({
        id: "geo-unsupported",
        tone: "warn",
        title: "This browser cannot share a location",
        body: "Positioning is unavailable here. Pick a district to browse instead — MEDIPAL never guesses where you are.",
      });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setOrigin([position.coords.latitude, position.coords.longitude]);
        setNotice({
          id: "geo-ok",
          tone: "info",
          title: "Ordered for an emergency, nearest first",
          body:
            "Distances are straight-line from your position to each centre's published coordinates. They are not driving distances and no route is requested.",
        });
      },
      (caught) => {
        setLocating(false);
        setNotice({
          id: "geo-denied",
          tone: "warn",
          title: "Location not shared",
          body:
            caught.code === caught.PERMISSION_DENIED
              ? "You declined the location prompt, so MEDIPAL has not received your position. Choose a district to browse instead."
              : "Your device could not determine a position. Choose a district to browse instead.",
        });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }

  function clearLocation() {
    setOrigin(null);
    setNotice(null);
  }

  function resetFilters() {
    setDistrict("");
    setBloodGroup("");
    setComponent("");
    setEmergency(false);
  }

  const activeFilters = Boolean(district || bloodGroup || component || emergency || origin);

  const summary = useMemo(() => {
    const centres = new Set(rows.map((row) => row.centreId)).size;
    const confirmed = rows.filter(
      (row) => (row.freshness === "LIVE" || row.freshness === "RECENT") && row.units > 0,
    ).length;
    return { centres, confirmed, lines: rows.length };
  }, [rows]);

  const disclaimer =
    meta?.disclaimer ??
    "Reported availability. Please call the blood centre to confirm before travelling.";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-full min-h-[640px] flex-col lg:flex-row">
      {/* ---- Sidebar: filters + results -------------------------------------- */}
      <div className="w-full border-b border-line bg-white/30 lg:w-[520px] lg:border-b-0 lg:border-r">
        <div className="border-b border-line bg-white/80 p-5 backdrop-blur-md lg:sticky lg:top-0 lg:z-10">
          {/* Emergency mode (§16) */}
          <button
            type="button"
            onClick={() => setEmergency((on) => !on)}
            aria-pressed={emergency}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] transition-all",
              emergency
                ? "border-crimson bg-crimson text-white shadow-glow-red-sm"
                : "border-crimson/30 bg-blush text-crimson hover:bg-blush/70",
            )}
          >
            <AlertTriangle className={cn("h-4 w-4", emergency && !reduceMotion && "animate-pulse")} aria-hidden />
            {emergency ? "Emergency ranking ON" : "Find blood now"}
          </button>
          {emergency && (
            <p className="mt-2 text-[0.68rem] leading-relaxed text-content-secondary">
              Confirmed and recently reported stock is listed first, then low stock, then
              unconfirmed figures. A stale or undated row is never shown as confirmed available.
            </p>
          )}

          {/* Four-level selection (§14) */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <label className="col-span-2 text-[0.6rem] font-bold uppercase tracking-widest text-content-secondary/70">
              State
            </label>
            <div className="col-span-2 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-content-primary">
              <MapPin className="h-4 w-4 text-crimson" aria-hidden />
              {STATE}
              <span className="ml-auto text-[0.6rem] uppercase tracking-widest text-content-secondary/60">
                {districts.length || "—"} districts
              </span>
            </div>

            <label className="col-span-2 mt-1 text-[0.6rem] font-bold uppercase tracking-widest text-content-secondary/70">
              District
            </label>
            <select
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              disabled={Boolean(origin)}
              aria-label="District"
              className="col-span-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-content-primary outline-none focus:border-crimson/50 disabled:opacity-50"
            >
              <option value="">All Bihar</option>
              {districts.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                  {item.approvedCentres > 0 ? ` · ${item.approvedCentres} centre(s)` : ""}
                </option>
              ))}
            </select>

            <div className="col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[0.6rem] font-bold uppercase tracking-widest text-content-secondary/70">
                  Blood group
                </label>
                <select
                  value={bloodGroup}
                  onChange={(event) => setBloodGroup(event.target.value)}
                  aria-label="Blood group"
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-content-primary outline-none focus:border-crimson/50"
                >
                  <option value="">Any</option>
                  {BLOOD_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[0.6rem] font-bold uppercase tracking-widest text-content-secondary/70">
                  Component
                </label>
                <select
                  value={component}
                  onChange={(event) => setComponent(event.target.value)}
                  aria-label="Component"
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-content-primary outline-none focus:border-crimson/50"
                >
                  <option value="">Any</option>
                  {COMPONENTS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={origin ? clearLocation : useMyLocation}
              disabled={locating}
              className="btn-secondary flex-1 justify-center text-xs"
            >
              {locating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Navigation className="h-3.5 w-3.5" aria-hidden />
              )}
              {origin ? "Clear my location" : "Use my location"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={!activeFilters}
              className="btn-secondary justify-center text-xs disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset
            </button>
            <button
              type="button"
              onClick={() => void load({ silent: true })}
              disabled={refreshing}
              aria-label="Refresh results"
              title="Refresh results"
              className="btn-secondary justify-center text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
            </button>
          </div>

          {/* Source + freshness strip (§16, §25) */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.6rem] font-medium uppercase tracking-widest text-content-secondary">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  streamState === "live" ? "bg-emerald-500" : "bg-amber-500",
                  streamState === "live" && !reduceMotion && "animate-pulse",
                )}
              />
              {streamState === "live" ? "Realtime connected" : "Realtime connecting"}
            </span>
            <span className="flex items-center gap-1.5">
              <Radio className="h-3 w-3" aria-hidden />
              {health?.status === "healthy" ? "Source live" : `Source: ${health?.status ?? "unknown"}`}
            </span>
            {health?.lastSuccessfulSync && (
              <span className="flex items-center gap-1.5 normal-case tracking-normal">
                <Activity className="h-3 w-3" aria-hidden />
                Last sync {relativeTime(health.lastSuccessfulSync)}
              </span>
            )}
          </div>

          {notice && (
            <div className="mt-4">
              <LiveNotice message={notice} onDismiss={() => setNotice(null)} />
            </div>
          )}
        </div>

        {/* ---- Results ------------------------------------------------------ */}
        <div className="max-h-[760px] space-y-4 overflow-y-auto p-4">
          {loading && <SkeletonList />}

          {!loading && error && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
              <p className="text-sm font-semibold text-amber-900">
                {error.isUnavailable ? "Blood data is temporarily unavailable" : "That search failed"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/80">{error.message}</p>
              <button type="button" onClick={() => void load()} className="btn-secondary mt-4 text-xs">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Try again
              </button>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="rounded-2xl border border-line bg-white/60 p-8 text-center">
              <p className="text-sm font-semibold text-content-primary">No centre is reporting this</p>
              <p className="mt-1 text-xs leading-relaxed text-content-secondary">
                No approved centre has published a figure for this combination. MEDIPAL shows an
                empty list rather than an estimate. Widen the district, or try a different group.
              </p>
            </div>
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              <p className="px-1 text-[0.65rem] font-semibold uppercase tracking-widest text-content-secondary">
                {summary.lines} figure{summary.lines === 1 ? "" : "s"} across {summary.centres} centre
                {summary.centres === 1 ? "" : "s"} · {summary.confirmed} confirmed
                {meta && "truncated" in meta && meta.truncated ? " · list truncated" : ""}
              </p>

              {rows.map((row) => (
                <ResultCard
                  key={grainOf(row)}
                  row={row}
                  selected={selected === grainOf(row)}
                  justChanged={Boolean(recentlyChanged[grainOf(row)])}
                  reduceMotion={Boolean(reduceMotion)}
                  onSelect={() => setSelected(grainOf(row))}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ---- Map ------------------------------------------------------------- */}
      <div className="relative min-h-[320px] flex-1 bg-blush-soft/20">
        <div ref={containerRef} className="h-full min-h-[320px] w-full grayscale-[0.2] contrast-[1.1]" />

        <div className="absolute left-4 top-4 z-[1000] max-w-[17rem] rounded-2xl border border-line bg-white/90 p-4 shadow-lg backdrop-blur-md">
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-content-primary">
            Freshness ladder
          </p>
          <ul className="mt-2 space-y-1.5">
            {(["LIVE", "RECENT", "STALE", "OUTDATED", "UNKNOWN"] as const).map((level) => (
              <li key={level} className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", LIVE_FRESHNESS_DOT[level])} />
                <span className="text-[0.62rem] text-content-secondary">
                  <span className="font-semibold text-content-primary">
                    {LIVE_FRESHNESS_LABEL[level]}
                  </span>{" "}
                  — {LIVE_FRESHNESS_EXPLANATION[level]}
                </span>
              </li>
            ))}
          </ul>
          <div className="divider-glass my-3" />
          <p className="text-[0.6rem] leading-relaxed text-content-secondary">
            Pins appear only for centres that published coordinates. District headquarters are used
            to frame the map, never as a centre's location.
          </p>
        </div>

        <div className="absolute bottom-4 left-4 right-4 z-[1000] rounded-2xl border border-line bg-white/90 px-4 py-3 shadow-lg backdrop-blur-md sm:right-auto sm:max-w-xl">
          <p className="text-[0.62rem] font-semibold leading-relaxed text-content-primary">
            {disclaimer}
          </p>
          <p className="mt-1 text-[0.58rem] leading-relaxed text-content-secondary">
            MEDIPAL does not reserve, hold or guarantee any unit. This is reported availability with
            its source and time shown on every row.
          </p>
        </div>

        <div className="absolute bottom-24 right-4 z-[1000]">
          <Link
            to="/ai-doctor"
            aria-label="Ask Al Saathi, the MEDIPAL AI assistant"
            className="flex items-center gap-3 rounded-full bg-[#17171C] px-5 py-3 text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-crimson">
              <Send className="h-4 w-4 text-white" aria-hidden />
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-[0.6rem] font-bold uppercase tracking-widest text-white/70">
                Al Saathi
              </span>
              <span className="block text-[0.65rem] font-medium">Ask in Hindi or English</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result card (§15, §16, §28)
// ---------------------------------------------------------------------------

function ResultCard({
  row,
  selected,
  justChanged,
  reduceMotion,
  onSelect,
}: {
  row: LiveCentreRow;
  selected: boolean;
  justChanged: boolean;
  reduceMotion: boolean;
  onSelect: () => void;
}) {
  const distance = formatDistance(row.distanceKm);
  const confirmed = row.freshness === "LIVE" || row.freshness === "RECENT";
  const phone = row.phone || row.emergencyHotline;

  return (
    <article
      onClick={onSelect}
      className={cn(
        "group cursor-pointer rounded-2xl border p-5 transition-all duration-300",
        selected
          ? "border-crimson bg-white ring-1 ring-crimson/10"
          : "border-line bg-white/60 hover:border-crimson/30 hover:bg-white",
        justChanged && !reduceMotion && "animate-[pulseRing_1.8s_ease-out_1]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-content-secondary/70">
            {row.category}
          </p>
          <h3 className="mt-1 truncate font-display text-base font-semibold text-content-primary">
            {row.name}
          </h3>
          <p className="mt-0.5 text-[0.68rem] text-content-secondary">
            {[row.district, row.address].filter(Boolean).join(" · ") || "Address not recorded"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {distance ? (
            <p className="text-sm font-bold text-content-primary">{distance.replace(" away", "")}</p>
          ) : (
            <p className="text-[0.6rem] uppercase tracking-widest text-content-secondary/60">
              Distance
              <br />
              not known
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-wider",
            LIVE_FRESHNESS_TONE[row.freshness],
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              LIVE_FRESHNESS_DOT[row.freshness],
              row.freshness === "LIVE" && !reduceMotion && "animate-pulse",
            )}
          />
          {LIVE_FRESHNESS_LABEL[row.freshness]}
        </span>
        <span className="rounded-full border border-line bg-white/70 px-2.5 py-1 text-[0.6rem] font-semibold text-content-secondary">
          {AVAILABILITY_STATUS_LABEL[row.availabilityStatus]}
        </span>
        {!confirmed && row.units > 0 && (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[0.6rem] font-semibold text-amber-800">
            Not confirmed
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-blush-soft/60 p-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-content-primary">
            {row.bloodGroup} · {row.component}
          </p>
          <p className="mt-0.5 text-[0.62rem] text-content-secondary">
            Last updated {relativeTime(row.lastUpdatedAt)}
            {row.lastUpdatedAt ? ` · ${absoluteTime(row.lastUpdatedAt)}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "font-display text-xl font-bold",
              row.units > 0 && confirmed ? "text-crimson" : "text-content-secondary/60",
            )}
          >
            {row.units}
            <span className="ml-1 text-[0.6rem] font-medium uppercase tracking-normal">
              {row.unit}
            </span>
          </p>
          <p className="text-[0.58rem] uppercase tracking-widest text-content-secondary/70">
            {confirmed ? "reported available" : "unconfirmed"}
          </p>
        </div>
      </div>

      {/* Source + verification (§16, §28) — always shown, never omitted. */}
      <div className="mt-3 flex items-start gap-2 text-[0.62rem] leading-relaxed text-content-secondary">
        <span className="mt-[0.15rem] shrink-0 font-semibold uppercase tracking-wider text-content-secondary/70">
          Source
        </span>
        <span className="min-w-0">
          {row.source.url ? (
            <a
              href={row.source.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 font-medium text-crimson hover:underline"
            >
              {row.source.label}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <span className="font-medium text-content-primary">{row.source.label}</span>
          )}
          <span className="ml-1">
            · {row.isProviderSynced ? "authorised feed" : "not from an authorised feed"}
          </span>
        </span>
      </div>

      {row.verification === "provider_authorized" && (
        <p className="mt-1 text-[0.6rem] uppercase tracking-wider text-ok">
          Centre identity supplied by the source itself
        </p>
      )}

      <p className="mt-2 text-[0.62rem] leading-relaxed text-content-secondary/80">
        {LIVE_FRESHNESS_EXPLANATION[row.freshness]}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <a
          href={phone ? `tel:${phone.replace(/\s+/g, "")}` : undefined}
          onClick={(event) => event.stopPropagation()}
          aria-disabled={!phone}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-colors",
            phone
              ? "bg-content-primary text-white hover:bg-black"
              : "cursor-not-allowed border border-line bg-white/60 text-content-secondary/50",
          )}
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
          {phone ? "Call centre" : "No phone recorded"}
        </a>
        <a
          href={
            row.coordinates
              ? `https://www.openstreetmap.org/?mlat=${row.coordinates[0]}&mlon=${row.coordinates[1]}#map=16/${row.coordinates[0]}/${row.coordinates[1]}`
              : undefined
          }
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => event.stopPropagation()}
          aria-disabled={!row.coordinates}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition-colors",
            row.coordinates
              ? "border-line bg-white text-content-primary hover:bg-blush-soft"
              : "cursor-not-allowed border-line bg-white/60 text-content-secondary/50",
          )}
        >
          <Navigation className="h-3.5 w-3.5" aria-hidden />
          {row.coordinates ? "Directions" : "No coordinates"}
        </a>
      </div>

      <p className="mt-3 border-t border-line/60 pt-3 text-[0.6rem] leading-relaxed text-content-secondary/80">
        {row.disclaimer}
      </p>
    </article>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-2xl border border-line bg-white/50 p-5">
          <div className="h-3 w-24 animate-pulse rounded bg-line" />
          <div className="mt-3 h-4 w-56 animate-pulse rounded bg-line" />
          <div className="mt-3 h-3 w-40 animate-pulse rounded bg-line" />
          <div className="mt-4 h-16 animate-pulse rounded-xl bg-blush-soft" />
        </div>
      ))}
    </div>
  );
}

/** Marker fill colour, as a literal hex so Leaflet never re-encodes it. */
function dotHex(level: LiveCentreRow["freshness"]): string {
  switch (level) {
    case "LIVE":
      return "#10b981";
    case "RECENT":
      return "#f59e0b";
    case "STALE":
      return "#d97706";
    case "OUTDATED":
      return "#dc2626";
    default:
      return "#94a3b8";
  }
}

/** Leaflet popups accept HTML, so provider text must be escaped first. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
