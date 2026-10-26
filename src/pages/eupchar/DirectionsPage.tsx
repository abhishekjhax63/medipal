import { useEffect, useState } from "react";
import { Building2, Compass, MapPin, Phone, ShieldAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuCard, EuEmptyState, EuNotice } from "@/components/eupchar/ui";
import { API_BASE, MAPS_ENABLED } from "@/services/eupchar/config";
import { selectHospital } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { formatPhone } from "@/lib/eupchar/format";

type GeoState =
  | { status: "idle" | "loading" }
  | { status: "ready"; latitude: number; longitude: number; formatted: string }
  | { status: "unavailable"; reason: string };

/**
 * Map & directions (spec §17).
 *
 * The supplied dataset publishes no street address or coordinates for any
 * hospital, so MEDIPAL will never drop a *verified* pin. What it can do
 * honestly is geocode the hospital's published name plus its district through
 * the server-side Geoapify proxy and show that as an explicitly *approximate*
 * area map — labelled as such. If geocoding finds nothing, the page says so and
 * points the visitor at the hospital's published phone number instead.
 */
export default function DirectionsPage() {
  const { hospitalId = "" } = useParams();
  const state = useEuState();
  const hospital = selectHospital(hospitalId, state);
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });

  const hospitalName = hospital?.name ?? "";
  const hospitalDistrict = hospital?.district ?? "";

  useEffect(() => {
    if (!MAPS_ENABLED || !hospitalName) {
      setGeo({ status: "idle" });
      return;
    }

    let cancelled = false;
    setGeo({ status: "loading" });
    const query = `${hospitalName}, ${hospitalDistrict}, Bihar, India`;

    void (async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/geoapify/geocode?text=${encodeURIComponent(query)}`,
          { headers: { Accept: "application/json" } },
        );
        if (cancelled) return;
        if (!response.ok) {
          setGeo({
            status: "unavailable",
            reason:
              response.status === 404
                ? "The map service could not match this hospital name to a place."
                : `The map service replied with ${response.status}.`,
          });
          return;
        }
        const payload = (await response.json()) as {
          latitude?: number;
          longitude?: number;
          formatted?: string;
        };
        if (
          typeof payload.latitude !== "number" ||
          typeof payload.longitude !== "number"
        ) {
          setGeo({ status: "unavailable", reason: "The map service returned no coordinates." });
          return;
        }
        setGeo({
          status: "ready",
          latitude: payload.latitude,
          longitude: payload.longitude,
          formatted: payload.formatted ?? query,
        });
      } catch {
        if (!cancelled) {
          setGeo({
            status: "unavailable",
            reason: "MEDIPAL could not reach the map service. Check your connection.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hospitalName, hospitalDistrict]);

  if (!hospital) {
    return (
      <EuShell>
        <EuEmptyState
          icon={Building2}
          title="Hospital not found"
          description="That hospital is not in the verified dataset."
          action={
            <Link to="/e-upchar/hospitals" className="eu-btn eu-btn-primary px-4 py-2.5">
              Back to the directory
            </Link>
          }
        />
      </EuShell>
    );
  }

  const phone = formatPhone(hospital.phone);

  return (
    <EuShell>
      <EuPageHeader
        eyebrow="E-UPCHAR · Location"
        title={hospital.name}
        description={`${hospital.district}, ${hospital.state}`}
        breadcrumb={[
          { label: "E-UPCHAR", to: "/e-upchar" },
          { label: "Hospitals", to: "/e-upchar/hospitals" },
          { label: hospital.name, to: `/e-upchar/hospitals/${hospital.id}` },
          { label: "Location & directions" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <EuCard className="overflow-hidden p-0">
          {geo.status === "ready" ? (
            <figure className="m-0">
              <img
                className="h-80 w-full object-cover"
                loading="lazy"
                alt={`Approximate map area around ${hospital.name}, ${hospital.district}`}
                src={`${API_BASE}/api/geoapify/staticmap?lat=${geo.latitude}&lon=${geo.longitude}&w=1024&h=640&zoom=13`}
              />
              <figcaption className="border-t border-eu-border bg-eu-surface px-5 py-3 text-xs leading-relaxed text-eu-muted">
                Approximate area only — centred on “{geo.formatted}”. This is a district-level guide,
                not a verified entrance or street address. {phone ? `Call ${phone} before travelling.` : "Call the hospital before travelling."}
              </figcaption>
            </figure>
          ) : geo.status === "loading" ? (
            <div className="flex h-80 items-center justify-center px-6 text-center text-sm text-eu-muted">
              Looking up an approximate map area…
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-eu-border bg-eu-surface text-eu-muted">
                <MapPin className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-base font-semibold text-eu-text">
                No map area available for this hospital
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-eu-muted">
                {geo.status === "unavailable" && geo.reason
                  ? geo.reason
                  : "The dataset MEDIPAL holds publishes no street address or coordinates for this hospital, so E-UPCHAR will not drop a pin somewhere it cannot verify."}{" "}
                Call the hospital for directions.
              </p>
              {phone && (
                <a href={`tel:${hospital.phone}`} className="eu-btn eu-btn-primary mt-5 gap-2 px-5 py-3">
                  <Phone className="h-4 w-4" aria-hidden />
                  Call {phone}
                </a>
              )}
            </div>
          )}
        </EuCard>

        <div className="space-y-5">
          <EuCard className="p-5">
            <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold text-eu-text">
              <Compass className="h-4 w-4 text-eu-red" aria-hidden />
              What MEDIPAL knows
            </h2>
            <dl className="mt-4 space-y-3 text-[0.85rem]">
              <Row label="District" value={`${hospital.district}, ${hospital.state}`} />
              <Row label="Street address" value="Not published in the dataset" />
              <Row
                label="Map coordinates"
                value={
                  geo.status === "ready"
                    ? `Approx. ${geo.latitude.toFixed(3)}, ${geo.longitude.toFixed(3)}`
                    : "Not published in the dataset"
                }
              />
              <Row
                label="Public contact"
                value={
                  phone ? (
                    <a href={`tel:${hospital.phone}`} className="text-eu-red-deep hover:underline">
                      {phone}
                    </a>
                  ) : (
                    "Not published in the dataset"
                  )
                }
              />
            </dl>
          </EuCard>

          <EuNotice tone="warn" title={geo.status === "ready" ? "This map is approximate" : "Why there is no map here"}>
            <span className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-eu-warn" aria-hidden />
              <span>
                {geo.status === "ready"
                  ? "MEDIPAL matched this hospital's published name and district to a map area. It is a guide to the right locality — not a verified entrance — so confirm the exact address with the hospital before you travel."
                  : "MEDIPAL only draws a marker once an operator has verified a hospital's exact coordinates. Until then, a pin would be a guess — and a wrong location in a medical context is worse than no location."}
              </span>
            </span>
          </EuNotice>

          <div className="flex flex-wrap gap-2.5">
            <Link
              to={`/e-upchar/hospitals/${hospital.id}`}
              className="eu-btn eu-btn-secondary px-4 py-2.5"
            >
              Back to services
            </Link>
            {phone && (
              <a href={`tel:${hospital.phone}`} className="eu-btn eu-btn-quiet gap-2 px-4 py-2.5">
                <Phone className="h-4 w-4" aria-hidden />
                Call hospital
              </a>
            )}
          </div>
        </div>
      </div>
    </EuShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-eu-muted">{label}</dt>
      <dd className="font-medium text-eu-text">{value}</dd>
    </div>
  );
}
