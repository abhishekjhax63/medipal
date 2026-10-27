import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Building2, CircleAlert, Info, LoaderCircle, MapPin } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/cn";
import { FACILITY_STATUS_LABEL, dataSourceLabel, relativeTime } from "@/lib/blood/presentation";
import { BloodApiError, bloodApi } from "@/services/blood/api";
import type { DirectoryFacility, FacilityStatus } from "@/services/blood/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; facilities: DirectoryFacility[]; note: string }
  | { kind: "error"; message: string };

/** India centroid, used only until real facility coordinates arrive. */
const FALLBACK_CENTER: L.LatLngExpression = [22.9734, 78.6569];
const FALLBACK_ZOOM = 5;
const FACILITY_ZOOM = 11;

/**
 * Map of the approved MEDIPAL blood network.
 *
 * Only facilities an administrator has actually approved appear here, and their
 * position is the coordinate the facility itself supplied during registration.
 * OpenStreetMap supplies the tiles; no facility is ever placed on the map by us.
 */
export function BloodNetworkMap() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    bloodApi
      .facilities({ status: "approved" }, controller.signal)
      .then((response) => {
        setState({ kind: "ready", facilities: response.facilities, note: response.note });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message:
            error instanceof BloodApiError
              ? error.message
              : "The approved blood network could not be loaded.",
        });
      });
    return () => controller.abort();
  }, []);

  const mapped = state.kind === "ready" ? state.facilities.filter((f) => f.coordinates) : [];

  // Create the map once, then keep the markers in step with the data.
  useEffect(() => {
    if (state.kind !== "ready" || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      scrollWheelZoom: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [state.kind]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    if (mapped.length === 0) return;

    const bounds: L.LatLngExpression[] = [];
    for (const facility of mapped) {
      const [lat, lng] = facility.coordinates as [number, number];
      bounds.push([lat, lng]);
      const marker = L.circleMarker([lat, lng], {
        radius: 7,
        color: "#0A3D75",
        weight: 2,
        fillColor: "#0B5FA5",
        fillOpacity: 0.75,
      });
      marker.bindPopup(
        `<strong>${escapeHtml(facility.name)}</strong><br />${escapeHtml(
          [facility.city, facility.state].filter(Boolean).join(", "),
        )}<br /><em>Reported by the facility itself</em>`,
      );
      marker.addTo(layer);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], FACILITY_ZOOM);
    } else {
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: FACILITY_ZOOM });
    }
    // Leaflet needs a nudge when the container was hidden or resized.
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [mapped]);

  return (
    <section id="blood-network" className="section-shell section-pad scroll-mt-28">
      <SectionHeading
        eyebrow="Blood network"
        title="Facilities MEDIPAL has approved"
        description="Every centre below registered itself and was reviewed by a MEDIPAL administrator before appearing here. Positions are the coordinates the facility supplied; the map tiles come from OpenStreetMap."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:gap-8">
        <GlassCard hairline interactive={false} className="overflow-hidden p-2">
          <div
            ref={containerRef}
            role="img"
            aria-label="Map of approved blood facilities in the MEDIPAL network"
            className={cn(
              "h-[320px] w-full rounded-3xl bg-blush-soft sm:h-[440px]",
              state.kind !== "ready" && "hidden",
            )}
          />
          {state.kind === "loading" ? (
            <div className="flex h-[320px] items-center justify-center rounded-3xl bg-blush-soft text-sm text-content-secondary sm:h-[440px]">
              <LoaderCircle className="mr-2.5 h-4 w-4 animate-spin" aria-hidden />
              Loading the approved network…
            </div>
          ) : null}
          {state.kind === "error" ? (
            <div className="flex h-[320px] flex-col items-center justify-center rounded-3xl bg-blush-soft px-6 text-center sm:h-[440px]">
              <CircleAlert className="h-6 w-6 text-crimson" aria-hidden />
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-content-secondary">
                {state.message}
              </p>
            </div>
          ) : null}
        </GlassCard>

        <GlassCard className="flex flex-col p-7 sm:p-8">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-4 w-4 text-crimson" aria-hidden />
            <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-content-primary">
              Approved facilities
            </h3>
            {state.kind === "ready" ? (
              <span className="ml-auto rounded-full border border-line bg-white/70 px-2.5 py-1 text-[0.68rem] font-medium tabular-nums text-content-secondary">
                {state.facilities.length}
              </span>
            ) : null}
          </div>

          {state.kind === "ready" && state.facilities.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-line bg-blush-soft px-4 py-4">
              <p className="text-sm leading-relaxed text-content-secondary">
                No facility has been approved yet, so the network is empty. MEDIPAL does not seed
                example hospitals or blood banks to make this list look populated.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-content-secondary/80">{state.note}</p>
            </div>
          ) : null}

          {state.kind === "ready" && state.facilities.length > 0 ? (
            <ul className="mt-5 max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {state.facilities.map((facility) => (
                <li
                  key={facility.id}
                  className="rounded-2xl border border-line bg-white/70 px-4 py-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-sm font-semibold text-content-primary">
                      {facility.name}
                    </p>
                    <span className="shrink-0 rounded-full border border-ok/30 bg-ok/[0.08] px-2.5 py-0.5 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-ok">
                      {FACILITY_STATUS_LABEL[facility.status as FacilityStatus] ?? facility.status}
                    </span>
                  </div>
                  <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-content-secondary">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-secondary/70" aria-hidden />
                    {[facility.city, facility.district, facility.state, facility.postalCode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="mt-2 text-[0.7rem] leading-relaxed text-content-secondary/80">
                    {dataSourceLabel(facility.dataSourceId)}
                    {facility.lastVerifiedAt
                      ? ` · last verified ${relativeTime(facility.lastVerifiedAt)}`
                      : " · verification time not recorded"}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          {state.kind === "ready" && state.facilities.length > 0 ? (
            <p className="mt-5 flex items-start gap-2.5 border-t border-line pt-4 text-xs leading-relaxed text-content-secondary/80">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crimson" aria-hidden />
              An approved facility is a verified organisation, not a promise of stock. Always call
              ahead before travelling.
            </p>
          ) : null}
        </GlassCard>
      </div>
    </section>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
