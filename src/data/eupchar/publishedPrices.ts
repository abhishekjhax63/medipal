/**
 * E-UPCHAR published prices — the only place a real amount may enter E-UPCHAR.
 *
 * Three rules govern this file, and none of them may be relaxed:
 *
 *  1. Every amount is copied from a named source, with that source's URL, the
 *     date it was read, and the source type. Nothing is estimated, averaged or
 *     inferred.
 *  2. A price stays attached to the provider that published it. A price found on
 *     one provider's page is never shown against a different hospital.
 *  3. Evidence that cannot be attached to a provider MEDIPAL actually lists is
 *     held in `priceResearchQueue` as research, not published as a price.
 *
 * `verifiedServicePrices` therefore contains only the records MEDIPAL can stand
 * behind: the Bihar NHM free diagnostic programme at the facility the programme
 * names, and IGIMS Patna's own published rate list.
 */

import type {
  HospitalService,
  PriceResearchRecord,
  PriceSource,
  ServicePrice,
} from "@/types/eupchar";

/** The date every source below was read and recorded. */
export const PRICE_RESEARCH_CHECKED_ON = "2026-10-28";

/* ------------------------------------------------------------------ */
/* Sources                                                            */
/* ------------------------------------------------------------------ */

export const verifiedPriceSources: readonly PriceSource[] = [
  {
    id: "src-nhm-bihar",
    name: "Bihar NHM — Free Diagnostic Services (State Health Society, Bihar)",
    url: "https://shs.bihar.gov.in/nhm-programme-details?id=Mzk%3D&page=diagnostic-services",
    type: "government_programme",
    permitted: true,
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
  },
  {
    id: "src-igims-tariff",
    name: "IGIMS Patna — Rate List of Various Services (effective June 2016)",
    url: "http://igims.org/Datafiles/cms/SERVICE%20CHARGES.pdf",
    type: "hospital",
    permitted: true,
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
  },
];

/* ------------------------------------------------------------------ */
/* Attachable records                                                 */
/* ------------------------------------------------------------------ */

/** The facility the Bihar NHM page names verbatim: "GGS Hospital (DH), Patna". */
const GGS_PATNA = "HOSP10G06690";
/**
 * IGIMS Patna. The verified directory lists it as "Indira Gandhi Institute of
 * Medical Science" — the institute that publishes igims.org's rate list.
 */
const IGIMS_PATNA = "HOSP10G06340";

const NHM_CONDITIONS =
  "Free under the Bihar NHM Free Radiological Services programme, which the source " +
  "states is provided free of cost at District Hospitals up to PHCs, and names " +
  "\u201cGGS Hospital (DH), Patna\u201d among facilities providing 300 mA X-ray free of cost " +
  "after consultation. X-rays are taken as prescribed by the doctor at the government " +
  "facility. The source states no income or category eligibility test for these " +
  "services. Confirm at the hospital's radiology counter before relying on it.";

const IGIMS_CONDITIONS =
  'IGIMS rate-list line: "ECHO DOPPLER [GEN WARD] 600.00" (Private Ward 1,000.00). ' +
  'MEDIPAL records the published General Ward figure against its "2D Echocardiography" ' +
  'entry; the source line is written as "ECHO DOPPLER". The list is dated "Effective from ' +
  'June 2016", so the amount is published but old — confirm the current charge at the ' +
  "IGIMS billing counter before paying.";

/** Hospital↔service links for the records below. */
export const verifiedHospitalServices: readonly HospitalService[] = [
  {
    id: "hs-nhm-ggs-xray-chest",
    hospitalId: GGS_PATNA,
    serviceId: "xray-chest",
    available: true,
    requiresPrescription: true,
    reportTurnaround: null,
    preparationInstructions: null,
    prerequisiteServiceIds: [],
  },
  {
    id: "hs-nhm-ggs-xray-limb",
    hospitalId: GGS_PATNA,
    serviceId: "xray-limb",
    available: true,
    requiresPrescription: true,
    reportTurnaround: null,
    preparationInstructions: null,
    prerequisiteServiceIds: [],
  },
  {
    id: "hs-nhm-ggs-xray-spine",
    hospitalId: GGS_PATNA,
    serviceId: "xray-spine",
    available: true,
    requiresPrescription: true,
    reportTurnaround: null,
    preparationInstructions: null,
    prerequisiteServiceIds: [],
  },
  {
    id: "hs-igims-echo-2d",
    hospitalId: IGIMS_PATNA,
    serviceId: "echo-2d",
    available: true,
    requiresPrescription: true,
    reportTurnaround: null,
    preparationInstructions: null,
    prerequisiteServiceIds: [],
  },
];

function nhmXray(serviceId: string): ServicePrice {
  return {
    id: `sp-nhm-ggs-${serviceId}`,
    hospitalId: GGS_PATNA,
    serviceId,
    hospitalPricePaise: 0,
    officialOnlinePricePaise: null,
    thirdPartyOnlinePricePaise: null,
    sourceId: "src-nhm-bihar",
    sourceName: "Bihar NHM — Free Diagnostic Services",
    sourceUrl:
      "https://shs.bihar.gov.in/nhm-programme-details?id=Mzk%3D&page=diagnostic-services",
    lastVerifiedOn: PRICE_RESEARCH_CHECKED_ON,
    staleDetectedOn: null,
    conditions: NHM_CONDITIONS,
    taxesAndFeesPaise: null,
    finalPayablePaise: 0,
    verificationStatus: "free_programme",
  };
}

export const verifiedServicePrices: readonly ServicePrice[] = [
  nhmXray("xray-chest"),
  nhmXray("xray-limb"),
  nhmXray("xray-spine"),
  {
    id: "sp-igims-echo-2d",
    hospitalId: IGIMS_PATNA,
    serviceId: "echo-2d",
    hospitalPricePaise: 60_000,
    officialOnlinePricePaise: null,
    thirdPartyOnlinePricePaise: null,
    sourceId: "src-igims-tariff",
    sourceName: "IGIMS Patna — Rate List of Various Services",
    sourceUrl: "http://igims.org/Datafiles/cms/SERVICE%20CHARGES.pdf",
    lastVerifiedOn: PRICE_RESEARCH_CHECKED_ON,
    // The published list is effective from June 2016, so it is flagged for re-checking.
    staleDetectedOn: PRICE_RESEARCH_CHECKED_ON,
    conditions: IGIMS_CONDITIONS,
    taxesAndFeesPaise: null,
    finalPayablePaise: 60_000,
    verificationStatus: "published",
  },
];

/* ------------------------------------------------------------------ */
/* Research queue                                                      */
/* ------------------------------------------------------------------ */

/**
 * Real prices MEDIPAL found but cannot publish:
 *
 *  - the provider is not in MEDIPAL's verified hospital directory, so attaching
 *    the amount to any listed hospital would breach the "never copy one
 *    provider's price to another" rule, or
 *  - the provider's service name does not map exactly to a catalogue service.
 *
 * An administrator reviews these and records them against the correct provider.
 */
export const priceResearchQueue: readonly PriceResearchRecord[] = [
  {
    id: "rq-paras-xray-kub",
    providerName: "Paras Health, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "X-RAY KUB",
    serviceId: null,
    amountPaise: 72_000,
    currency: "INR",
    category: "X-Ray",
    unit: "individual",
    sourceName: "Paras Health Patna — Book Radiology Test",
    sourceUrl: "https://www.parashospitals.com/patna/book-radiology-test",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions: "Listed with a per-test \"Book Now\" link on the Patna radiology page.",
  },
  {
    id: "rq-paras-xray-abdomen-supine",
    providerName: "Paras Health, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "X-RAY ABDOMEN - SUPINE",
    serviceId: null,
    amountPaise: 79_000,
    currency: "INR",
    category: "X-Ray",
    unit: "individual",
    sourceName: "Paras Health Patna — Book Radiology Test",
    sourceUrl: "https://www.parashospitals.com/patna/book-radiology-test",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions: null,
  },
  {
    id: "rq-paras-usg-whole-abdomen-tvs",
    providerName: "Paras Health, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "USG WHOLE ABDOMEN WITH TVS",
    serviceId: null,
    amountPaise: 393_300,
    currency: "INR",
    category: "Ultrasound",
    unit: "individual",
    sourceName: "Paras Health Patna — Book Radiology Test",
    sourceUrl: "https://www.parashospitals.com/patna/book-radiology-test",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions:
      "Published as \u20b9 3,933 against a struck-through \u20b9 4,738 with \"17% OFF\". MEDIPAL records only the payable figure and does not present the struck-through amount as a saving.",
  },
  {
    id: "rq-paras-usg-cd-charges",
    providerName: "Paras Health, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "ULTRA SOUND (CD CHARGES)/(EXTRA FILM)",
    serviceId: null,
    amountPaise: 46_000,
    currency: "INR",
    category: "Ultrasound",
    unit: "addon",
    sourceName: "Paras Health Patna — Book Radiology Test",
    sourceUrl: "https://www.parashospitals.com/patna/book-radiology-test",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions: "An add-on charge, not the price of a scan itself.",
  },
  {
    id: "rq-lalpath-hba1c",
    providerName: "Dr Lal PathLabs, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "HbA1c",
    serviceId: "lab-hba1c",
    amountPaise: 44_000,
    currency: "INR",
    category: "Blood Tests",
    unit: "individual",
    sourceName: "Dr Lal PathLabs — HbA1c (Patna)",
    sourceUrl: "https://www.lalpathlabs.com/test/pathology/hba1c/patna",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions:
      "Price shown for the Patna collection point. Includes HbA1c % and eAG; no fasting required; home collection available.",
  },
  {
    id: "rq-lalpath-heart-health-screen",
    providerName: "Dr Lal PathLabs, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "Heart Health Screen",
    serviceId: null,
    amountPaise: 197_000,
    currency: "INR",
    category: "Health Checkup Packages",
    unit: "package",
    sourceName: "Dr Lal PathLabs — Heart Health Screen (Patna)",
    sourceUrl: "https://www.lalpathlabs.com/test/pathology/heart-health-screen/patna",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions:
      "\"Duly filled ASCVD form (Form 59) is mandatory for patient aged 20 years and above.\" Published at \u20b91,970 against a struck-through \u20b92,650.",
  },
  {
    id: "rq-lalpath-mri-brain-perfusion",
    providerName: "Dr Lal PathLabs, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "MRI BRAIN WITH PERFUSION STUDY WITH CONTRAST",
    serviceId: null,
    amountPaise: 1_182_000,
    currency: "INR",
    category: "MRI",
    unit: "individual",
    sourceName: "Dr Lal PathLabs — Radiology test MR132",
    sourceUrl: "https://www.lalpathlabs.com/radiology-tests/MR132?item_id=MR132",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions:
      "Includes contrast. MEDIPAL's catalogue entry is plain \u201cMRI — Brain\u201d, so this is not recorded against it.",
  },
  {
    id: "rq-ruban-executive-health-check",
    providerName: "Ruban Memorial Hospital, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "Executive Health Check",
    serviceId: null,
    amountPaise: 399_900,
    currency: "INR",
    category: "Health Checkup Packages",
    unit: "package",
    sourceName: "Ruban Memorial Hospital — Executive Health Check",
    sourceUrl: "https://rubanhospitals.com/health-check-packages/executive-health-check",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions:
      "23 tests, including PSA, chest X-ray, ultrasound whole abdomen, ECG, ECHO/TMT, PFT and a GP consultation.",
  },
  {
    id: "rq-ruban-premium-package",
    providerName: "Ruban Memorial Hospital, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "Premium Package",
    serviceId: null,
    amountPaise: 849_900,
    currency: "INR",
    category: "Health Checkup Packages",
    unit: "package",
    sourceName: "Ruban Memorial Hospital — Premium Package",
    sourceUrl: "https://rubanhospitals.com/health-check-packages/premium-package",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions: "38 tests.",
  },
  {
    id: "rq-ruban-master-health-check",
    providerName: "Ruban Memorial Hospital, Patna",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "Master Health Check",
    serviceId: null,
    amountPaise: 289_900,
    currency: "INR",
    category: "Health Checkup Packages",
    unit: "package",
    sourceName: "Ruban Memorial Hospital — homepage package list",
    sourceUrl: "https://rubanhospitals.com/",
    sourceType: "official_online",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions: "20 tests. Listed on the hospital homepage alongside other packages.",
  },
  {
    id: "rq-igims-echo-pvt-ward",
    providerName: "Indira Gandhi Institute of Medical Science (IGIMS), Patna",
    inVerifiedDirectory: true,
    hospitalId: IGIMS_PATNA,
    serviceName: "ECHO DOPPLER [PVT WARD]",
    serviceId: null,
    amountPaise: 100_000,
    currency: "INR",
    category: "Heart Scans",
    unit: "individual",
    sourceName: "IGIMS Patna — Rate List of Various Services (effective June 2016)",
    sourceUrl: "http://igims.org/Datafiles/cms/SERVICE%20CHARGES.pdf",
    sourceType: "hospital",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "published",
    conditions:
      "Private-ward rate. The General Ward rate (\u20b9600) is the figure recorded against this hospital.",
  },
  {
    id: "rq-nhm-free-pathology",
    providerName: "Bihar NHM Free Pathological Services (District Hospitals up to PHCs)",
    inVerifiedDirectory: false,
    hospitalId: null,
    serviceName: "Free Pathological Services",
    serviceId: null,
    amountPaise: null,
    currency: "INR",
    category: "Blood Tests",
    unit: "individual",
    sourceName: "Bihar NHM — Free Diagnostic Services (State Health Society, Bihar)",
    sourceUrl:
      "https://shs.bihar.gov.in/nhm-programme-details?id=Mzk%3D&page=diagnostic-services",
    sourceType: "government_programme",
    checkedOn: PRICE_RESEARCH_CHECKED_ON,
    state: "free_programme",
    conditions:
      "The source states pathological services (blood, stool, urine samples and rapid tests) are provided free of cost in-house from District Hospitals up to PHCs, as prescribed by the doctors deputed at the facility. It states no income or category eligibility test. This is not attachable to a single listed hospital without confirming that facility's current participation.",
  },
];
