/**
 * E-UPCHAR directory — the read model over the verified dataset.
 *
 * Two very different kinds of data live here and must never be confused:
 *
 *  1. `hospitals` / `hospitalLocations` — derived from the owner-supplied,
 *     verified Bihar PM-JAY dataset. Read-only. Never invented.
 *  2. `configuredServices` / `configuredPrices` — hospital-specific service
 *     availability and pricing configured by an authorised administrator
 *     (or, in Practice mode, explicitly labelled practice data).
 *
 * Starting point for (2) is an empty list. That is deliberate: the supplied
 * dataset publishes no service catalogue, so MEDIPAL must not pretend the
 * hospitals offer anything until it is configured.
 */

import {
  biharDistrictReference,
  hospitalDatasetMeta,
  verifiedHospitals,
  type DistrictReference,
  type VerifiedHospitalRecord,
} from "@/data/eupchar/biharHospitals";
import {
  serviceCategoriesById,
  serviceComponentsByServiceId,
} from "@/data/eupchar/serviceCatalog";
import type {
  Hospital,
  HospitalLocation,
  HospitalService,
  HospitalServiceView,
  PriceSource,
  Service,
  ServiceCategory,
  ServicePrice,
} from "@/types/eupchar";

/* ------------------------------------------------------------------ */
/* Verified hospitals                                                  */
/* ------------------------------------------------------------------ */

function toHospital(record: VerifiedHospitalRecord): Hospital {
  return {
    id: record.id,
    name: record.name,
    state: hospitalDatasetMeta.state,
    district: record.district,
    // The dataset publishes no city. Never guess one.
    city: record.city,
    address: record.address,
    phone: record.phone,
    ownership: record.ownership,
    schemes: record.schemes,
    empanelmentStatus: record.empanelmentStatus,
    departments: [],
    openingHours: null,
    enabled: true,
    datasetId: hospitalDatasetMeta.datasetId,
  };
}

/** Every verified hospital, as a `Hospital`. */
export const verifiedHospitalEntities: readonly Hospital[] = verifiedHospitals.map(toHospital);

/** One verified location row per hospital. Coordinates stay unverified. */
export const verifiedHospitalLocations: readonly HospitalLocation[] = verifiedHospitals.map(
  (record) => ({
    id: `${record.id}-loc-1`,
    hospitalId: record.id,
    label: record.name,
    address: record.address,
    city: record.city,
    district: record.district,
    state: hospitalDatasetMeta.state,
    latitude: record.latitude,
    longitude: record.longitude,
    coordinatesVerified: false,
  }),
);

export const districtReferenceByDistrict: ReadonlyMap<string, DistrictReference> = new Map(
  biharDistrictReference.map((entry) => [entry.district, entry]),
);

/* ------------------------------------------------------------------ */
/* Admin-configured availability (empty until configured)              */
/* ------------------------------------------------------------------ */

export const EMPTY_HOSPITAL_SERVICES: readonly HospitalService[] = [];
export const EMPTY_SERVICE_PRICES: readonly ServicePrice[] = [];
export const EMPTY_PRICE_SOURCES: readonly PriceSource[] = [];

/* ------------------------------------------------------------------ */
/* Join helpers                                                        */
/* ------------------------------------------------------------------ */

/** Builds the display row for one hospital+service pair. */
export function buildHospitalServiceView(
  service: Service,
  hospitalService: HospitalService,
  price: ServicePrice | null,
): HospitalServiceView | null {
  const category = serviceCategoriesById.get(service.categoryId);
  if (!category) return null;

  return {
    service,
    category,
    hospitalService,
    price,
    components: serviceComponentsByServiceId.get(service.id) ?? [],
    displayPricePaise: resolveDisplayPricePaise(price),
    priceStatus: price?.verificationStatus ?? "unverified",
  };
}

const PAYABLE_STATUSES: ReadonlySet<ServicePrice["verificationStatus"]> = new Set([
  "verified",
  "practice",
]);

/**
 * Only a verified (or explicitly-labelled practice) record may surface a number.
 * An unverified record always yields `null` so the UI shows
 * "Price unavailable — contact the hospital."
 */
export function resolveDisplayPricePaise(price: ServicePrice | null): number | null {
  if (!price || !PAYABLE_STATUSES.has(price.verificationStatus)) return null;
  if (price.finalPayablePaise !== null) return price.finalPayablePaise;
  if (price.hospitalPricePaise === null) return null;
  return price.hospitalPricePaise + (price.taxesAndFeesPaise ?? 0);
}

export function sortByName<T extends { name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* Query helpers                                                       */
/* ------------------------------------------------------------------ */

export type DistrictGroup = {
  readonly district: string;
  readonly hospitals: readonly Hospital[];
  readonly reference: DistrictReference | null;
};

/** Groups hospitals by district, districts sorted alphabetically. */
export function groupHospitalsByDistrict(hospitals: readonly Hospital[]): DistrictGroup[] {
  const map = new Map<string, Hospital[]>();
  for (const hospital of hospitals) {
    const list = map.get(hospital.district) ?? [];
    list.push(hospital);
    map.set(hospital.district, list);
  }
  return [...map.entries()]
    .map(([district, rows]) => ({
      district,
      hospitals: sortByName(rows),
      reference: districtReferenceByDistrict.get(district) ?? null,
    }))
    .sort((a, b) => a.district.localeCompare(b.district));
}

const DISTRICT_ALIASES: Readonly<Record<string, string>> = {
  bhabua: "kaimur (bhabua)",
  kaimur: "kaimur (bhabua)",
  motihari: "east champaran",
  champaran: "west champaran",
  bhojpur: "bhojpur",
  arrah: "bhojpur",
  ara: "bhojpur",
  gaya: "gaya",
};

/** Free-text search across hospital name, district, state and hospital ID. */
export function matchesHospitalQuery(hospital: Hospital, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [hospital.name, hospital.district, hospital.state, hospital.id]
    .join(" ")
    .toLowerCase();
  if (haystack.includes(query)) return true;
  const alias = DISTRICT_ALIASES[query];
  return alias ? hospital.district.toLowerCase() === alias : false;
}

/** Matches a diagnostic service against a free-text query. */
export function matchesServiceQuery(
  service: Service,
  category: ServiceCategory,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [service.name, service.summary, category.label, ...category.searchTerms]
    .join(" ")
    .toLowerCase();
  if (haystack.includes(query)) return true;
  // Multi-word queries: every token must appear somewhere.
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export { hospitalDatasetMeta, biharDistrictReference };
