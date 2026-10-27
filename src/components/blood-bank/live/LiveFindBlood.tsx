import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import {
  Phone,
  Send,
  MapPin,
  Navigation,
  MessageSquare,
  Search,
  Filter,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { LiveNotice, type LiveNoticeMessage } from "./LiveNotice";

// Patna centroid
const PATNA_CENTER: L.LatLngExpression = [25.5941, 85.1376];
const FACILITY_ZOOM = 13;

interface Facility {
  id: string;
  name: string;
  type: string;
  address: string;
  bloodGroup: string;
  component: string;
  units: number;
  lastVerified: string;
  status: "verified" | "due" | "stale";
  coordinates: [number, number];
  phone: string;
}

const MOCK_FACILITIES: Facility[] = [
  {
    id: "1",
    name: "Gardanibagh Sub-Divisional Hospital",
    type: "HOSPITAL BLOOD BANK",
    address: "Road No. 1, Gardanibagh, Patna",
    bloodGroup: "O-",
    component: "Packed Red Blood Cells",
    units: 4,
    lastVerified: "3 hrs ago",
    status: "verified",
    coordinates: [25.5988, 85.1158],
    phone: "0612-2250123"
  },
  {
    id: "2",
    name: "Jaiprabha Hospital Model Blood Bank",
    type: "REGIONAL BLOOD CENTER",
    address: "Kankarbagh, Near Colony More, Patna",
    bloodGroup: "O-",
    component: "Packed Red Blood Cells",
    units: 9,
    lastVerified: "1 hr ago",
    status: "verified",
    coordinates: [25.5925, 85.1522],
    phone: "0612-2350456"
  },
  {
    id: "3",
    name: "AIIMS Patna (Apex Hub)",
    type: "CENTRAL BLOOD BANK",
    address: "Phulwari Sharif, Patna",
    bloodGroup: "O-",
    component: "Packed Red Blood Cells",
    units: 12,
    lastVerified: "5 hrs ago",
    status: "due",
    coordinates: [25.5606, 85.0754],
    phone: "0612-2451000"
  },
  {
    id: "4",
    name: "PMCH Patna",
    type: "GOVERNMENT BLOOD BANK",
    address: "Ashok Rajpath, Patna",
    bloodGroup: "O-",
    component: "Packed Red Blood Cells",
    units: 0,
    lastVerified: "12 hrs ago",
    status: "stale",
    coordinates: [25.6206, 85.1544],
    phone: "0612-2300080"
  }
];

const STATUS_LABEL: Record<Facility["status"], string> = {
  verified: "Recently verified (<4h)",
  due: "Update due (4-12h)",
  stale: "Stale / Unconfirmed",
};

/** Great-circle distance in kilometres between two [lat, lng] pairs. */
function haversineKm(from: [number, number], to: [number, number]): number {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to[0] - from[0]);
  const dLon = toRad(to[1] - from[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function LiveFindBlood() {
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Facility["status"]>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<LiveNoticeMessage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.CircleMarker }>({});

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = MOCK_FACILITIES.filter((facility) => {
      if (statusFilter !== "all" && facility.status !== statusFilter) return false;
      if (needle) {
        const haystack = `${facility.name} ${facility.address} ${facility.type}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    if (!origin) return filtered;
    return [...filtered].sort(
      (a, b) => haversineKm(origin, a.coordinates) - haversineKm(origin, b.coordinates),
    );
  }, [query, statusFilter, origin]);

  const filtered = query.trim() !== "" || statusFilter !== "all";
  const special = MOCK_FACILITIES.filter((f) => f.status !== "verified").length;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: PATNA_CENTER,
      zoom: FACILITY_ZOOM,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;

    MOCK_FACILITIES.forEach(facility => {
      const color = facility.status === "verified" ? "#10b981" : facility.status === "due" ? "#f59e0b" : "#0b5fa5";
      const marker = L.circleMarker(facility.coordinates, {
        radius: 8,
        color: color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.8,
      }).addTo(map);

      marker.bindPopup(`<strong>${facility.name}</strong><br/>${facility.units} units available`);
      markersRef.current[facility.id] = marker;

      marker.on('click', () => setSelectedFacility(facility.id));
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (selectedFacility && mapRef.current && markersRef.current[selectedFacility]) {
      const facility = MOCK_FACILITIES.find(f => f.id === selectedFacility);
      if (facility) {
        mapRef.current.setView(facility.coordinates, FACILITY_ZOOM + 1);
        markersRef.current[selectedFacility].openPopup();
      }
    }
  }, [selectedFacility]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setNotice({
        id: "geo-unsupported",
        tone: "warn",
        title: "This browser cannot share a location",
        body: "Positioning is unavailable in this browser. Search by name or use the map to pick a facility instead.",
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
          title: "Sorted by straight-line distance",
          body: "Distances below are calculated on your device from your current position to each facility's centre point. They are not driving distances and no route is requested.",
        });
      },
      (error) => {
        setLocating(false);
        setNotice({
          id: "geo-denied",
          tone: "warn",
          title: "Location not shared",
          body:
            error.code === error.PERMISSION_DENIED
              ? "You denied the location prompt, so MEDIPAL has not received your position. The directory still works: search by name or pick a facility from the map."
              : "Your device could not determine a position. The directory still works: search by name or pick a facility from the map.",
        });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
  }

  return (
    <div className="flex h-full min-h-[600px] flex-col lg:flex-row">
      {/* Sidebar List */}
      <div className="w-full border-r border-line bg-white/30 lg:w-[450px]">
        <div className="sticky top-0 z-10 border-b border-line bg-white/80 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-content-secondary">
              Found {visible.length} of {MOCK_FACILITIES.length} facilities
            </h2>
            <button
              type="button"
              onClick={() => setShowFilters((open) => !open)}
              aria-expanded={showFilters}
              className={cn(
                "flex items-center gap-2 text-xs font-medium transition-colors",
                showFilters || filtered ? "text-crimson" : "text-content-secondary hover:text-crimson",
              )}
            >
              <Filter className="h-3.5 w-3.5" aria-hidden />
              {showFilters ? "Hide filters" : "Filter results"}
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
              <Search className="h-4 w-4 text-content-secondary/50" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search hospitals..."
                aria-label="Search facilities by name or address"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              aria-label="Sort by distance from my location"
              title="Sort by distance from my location"
              className="rounded-xl border border-line bg-white px-3 py-2 text-content-secondary transition-colors hover:bg-blush-soft disabled:opacity-60"
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Navigation className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 space-y-3 rounded-xl border border-line bg-white p-4">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">
                  Verification freshness
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["all", "verified", "due", "stale"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatusFilter(value)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[0.65rem] font-semibold transition-colors",
                        statusFilter === value
                          ? "border-crimson bg-crimson text-white"
                          : "border-line bg-white text-content-secondary hover:border-crimson/40",
                      )}
                    >
                      {value === "all" ? "All" : STATUS_LABEL[value]}
                    </button>
                  ))}
                </div>
              </div>
              {filtered && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-crimson hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Clear filters
                </button>
              )}
            </div>
          )}

          {notice && (
            <div className="mt-4">
              <LiveNotice message={notice} onDismiss={() => setNotice(null)} />
            </div>
          )}
        </div>

        <div className="max-h-[700px] overflow-y-auto p-4 space-y-4">
          {visible.length === 0 && (
            <div className="rounded-2xl border border-line bg-white/60 p-8 text-center">
              <p className="text-sm font-semibold text-content-primary">No facility matches</p>
              <p className="mt-1 text-xs text-content-secondary">
                Try a different name, or reset the verification filter.
              </p>
              <button type="button" onClick={resetFilters} className="btn-secondary mt-4">
                Clear filters
              </button>
            </div>
          )}

          {visible.map((facility) => (
            <div
              key={facility.id}
              onClick={() => setSelectedFacility(facility.id)}
              className={cn(
                "group relative cursor-pointer rounded-2xl border p-5 transition-all duration-300 hover:shadow-md",
                selectedFacility === facility.id
                  ? "border-crimson bg-white ring-1 ring-crimson/10"
                  : "border-line bg-white/60 hover:border-crimson/30 hover:bg-white"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-widest text-content-secondary/70">
                    {facility.type}
                  </p>
                  <h3 className="mt-1 font-display text-base font-semibold text-content-primary">
                    {facility.name}
                  </h3>
                </div>
                <div className="text-right">
                  {origin ? (
                    <>
                      <p className="text-sm font-bold text-content-primary">
                        {haversineKm(origin, facility.coordinates).toFixed(1)} km
                      </p>
                      <p className="text-[0.6rem] font-medium text-content-secondary uppercase tracking-tighter">
                        straight-line
                      </p>
                    </>
                  ) : (
                    <p className="text-[0.6rem] font-medium text-content-secondary uppercase tracking-tighter">
                      Share location
                      <br />
                      for distance
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl bg-blush-soft/50 p-3">
                <div>
                  <p className="text-xs font-semibold text-content-primary">{facility.bloodGroup} {facility.component}</p>
                  <p className="mt-0.5 text-[0.65rem] text-content-secondary">Last verified: {facility.lastVerified}</p>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-xl font-display font-bold",
                    facility.units > 0 ? "text-crimson" : "text-content-secondary/50"
                  )}>
                    {facility.units} <span className="text-[0.65rem] uppercase tracking-normal">Units</span>
                  </p>
                  <p className="text-[0.6rem] font-medium text-content-secondary uppercase tracking-tighter">reported available</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-2 w-2 rounded-full animate-pulse",
                    facility.status === "verified" ? "bg-emerald-500" : facility.status === "due" ? "bg-amber-500" : "bg-crimson"
                  )} />
                  <span className="text-[0.65rem] font-medium text-content-secondary uppercase tracking-wider">
                    {STATUS_LABEL[facility.status]}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <a
                  href={`tel:${facility.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-content-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-black"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  Call
                </a>
                <Link
                  to="/ai-doctor"
                  onClick={(e) => e.stopPropagation()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-xs font-medium text-content-primary transition-colors hover:bg-blush-soft"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  Ask Al Saathi
                </Link>
              </div>

              <div className="mt-4 flex items-start gap-2 border-t border-line/50 pt-4 text-[0.65rem] text-content-secondary/80">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                <p>{facility.address}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Map Content */}
      <div className="relative flex-1 bg-blush-soft/20">
        <div ref={containerRef} className="h-full w-full grayscale-[0.2] contrast-[1.1]" />

        {/* Patna Network Status Overlay */}
        <div className="absolute right-6 top-6 z-[1000] w-64 rounded-2xl border border-line bg-white/90 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
            <h4 className="text-[0.7rem] font-bold uppercase tracking-widest text-content-primary">Patna Network Status</h4>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-[0.65rem] font-medium text-content-secondary uppercase tracking-wider">Recently verified (&lt;4h)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-[0.65rem] font-medium text-content-secondary uppercase tracking-wider">Update due (4-12h)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-crimson" />
              <span className="text-[0.65rem] font-medium text-content-secondary uppercase tracking-wider">Stale unconfirmed (&gt;12h)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-content-secondary/30" />
              <span className="text-[0.65rem] font-medium text-content-secondary uppercase tracking-wider">Unconfirmed / No Stock</span>
            </div>
          </div>

          <div className="divider-glass my-4" />
          <p className="text-[0.6rem] font-medium text-amber-600 uppercase tracking-tighter leading-tight">
            DEMO DATA — NOT LIVE HOSPITAL INVENTORY
          </p>
          <p className="mt-2 text-[0.6rem] leading-tight text-content-secondary">
            {special} of {MOCK_FACILITIES.length} listings are overdue or stale.
          </p>
        </div>

        {/* AI Saathi Floating Button */}
        <div className="absolute bottom-6 right-6 z-[1000]">
          <Link
            to="/ai-doctor"
            aria-label="Ask Al Saathi, the MEDIPAL AI assistant"
            className="flex items-center gap-3 rounded-full bg-[#0B1B2B] px-6 py-3 text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-crimson">
              <MessageSquare className="h-4 w-4 text-white" aria-hidden />
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-white/70">
                Al Saathi <span className="ml-2 rounded bg-crimson/20 px-1 py-0.5 text-[0.5rem] text-crimson">Patna</span>
              </p>
              <p className="text-[0.65rem] font-medium">Find Blood · Ask in Hindi/Eng</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
