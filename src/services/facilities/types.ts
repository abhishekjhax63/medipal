/**
 * Real healthcare facility search — shared vocabulary.
 *
 * Every record is a real place returned by OpenStreetMap (Nominatim geocoding +
 * Overpass directory). A field the source does not publish is `null` and the UI
 * must say so — never a placeholder. A facility appearing here is a *location*,
 * not evidence of blood stock, a service menu, a price or a doctor.
 */

export type FacilityKind =
  | "hospital"
  | "clinic"
  | "blood_bank"
  | "pharmacy"
  | "doctors"
  | "dentist"
  | "other";

export const FACILITY_KIND_LABEL: Record<FacilityKind, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  blood_bank: "Blood service",
  pharmacy: "Pharmacy",
  doctors: "Doctors",
  dentist: "Dentist",
  other: "Healthcare facility",
};

export type Facility = {
  /** Stable id derived from the OpenStreetMap type and id. */
  readonly id: string;
  readonly osmType: string;
  readonly osmId: number;
  /** `null` when the contributor did not record a name. Never invented. */
  readonly name: string | null;
  readonly kind: FacilityKind;
  readonly category: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly district: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
  readonly latitude: number;
  readonly longitude: number;
  /** Metres from the searched origin, or `null` when no origin was supplied. */
  readonly distanceMeters: number | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly openingHours: string | null;
  readonly operator: string | null;
  readonly emergency: boolean;
  readonly source: string;
  /** Deep link to the OpenStreetMap element this record came from. */
  readonly sourceUrl: string;
};

export type FacilityAttribution = {
  readonly text: string;
  readonly url: string;
  readonly licence: string;
};

export type FacilityOrigin = {
  readonly latitude: number;
  readonly longitude: number;
  /** A human-readable place label, or `null` when only coordinates were used. */
  readonly formatted: string | null;
};

export type FacilitySearchResponse = {
  readonly origin: FacilityOrigin | null;
  readonly areaLabel: string | null;
  readonly facilities: readonly Facility[];
  readonly totalMatching: number;
  readonly radiusMeters: number;
  readonly types: readonly FacilityKind[];
  readonly sortBy: "distance" | "name";
  readonly attribution: FacilityAttribution;
  readonly sources: { readonly geocoder: string; readonly directory: string };
  readonly fetchedAt: string;
};

export type FacilityDirectoryStatus = {
  readonly status: "live" | "not_configured";
  readonly provider: string;
  readonly geocoder: string;
  readonly directory: string;
  readonly attribution: FacilityAttribution;
  readonly facilityKinds: readonly FacilityKind[];
  readonly policy: string;
};

/** The radius options offered by the UI, in kilometres. */
export const RADIUS_OPTIONS_KM = [5, 10, 25, 50] as const;

/** `4.2 km away`, or `null` when the origin was never supplied. */
export function formatFacilityDistance(metres: number | null | undefined): string | null {
  if (typeof metres !== "number" || !Number.isFinite(metres)) return null;
  if (metres < 1000) return `${Math.round(metres)} m away`;
  return `${(metres / 1000).toFixed(1)} km away`;
}

/** A directions deep link that hands the chosen facility to the user's maps app. */
export function facilityDirectionsUrl(facility: Facility): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${facility.latitude},${facility.longitude}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
