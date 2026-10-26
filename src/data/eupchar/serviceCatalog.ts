/**
 * MEDIPAL diagnostic service catalogue.
 *
 * This is MEDIPAL's own taxonomy of service *types*. It is deliberately
 * decoupled from hospitals: linking a service to a hospital, and pricing it,
 * are separate steps performed by an authorised administrator (spec §5, §9).
 *
 * Rules honoured here:
 *  - No price is set anywhere. Prices live in `ServicePrice` records only.
 *  - No preparation instructions are invented (spec §8) — they stay `null`.
 *  - No report turnaround is invented — it stays `null`.
 *  - `description` describes the modality in neutral, non-advisory language.
 */

import type {
  Service,
  ServiceCategory,
  ServiceComponent,
  ServiceGroup,
} from "@/types/eupchar";

export const serviceGroupLabels: Readonly<Record<ServiceGroup, string>> = {
  imaging: "Scans & Imaging",
  laboratory: "Laboratory",
  other: "Other configured services",
};

export const serviceGroupOrder: readonly ServiceGroup[] = ["imaging", "laboratory", "other"];

/** Category labels from spec §6. Labels are taxonomy, not an availability claim. */
export const serviceCategories: readonly ServiceCategory[] = [
  { id: "ct", label: "CT Scan", group: "imaging", searchTerms: ["ct", "computed tomography", "scan"] },
  { id: "mri", label: "MRI", group: "imaging", searchTerms: ["mri", "magnetic resonance", "scan"] },
  { id: "ultrasound", label: "Ultrasound", group: "imaging", searchTerms: ["ultrasound", "usg", "sonography"] },
  { id: "xray", label: "X-Ray", group: "imaging", searchTerms: ["xray", "x-ray", "radiograph"] },
  { id: "mammography", label: "Mammography", group: "imaging", searchTerms: ["mammography", "mammogram", "breast"] },
  { id: "dexa", label: "DEXA Scan", group: "imaging", searchTerms: ["dexa", "bone density", "bmd"] },
  { id: "heart-scan", label: "Heart Scans", group: "imaging", searchTerms: ["heart", "cardiac", "echo", "ecg", "ekg", "tmt"] },
  { id: "vascular-scan", label: "Vascular Scans", group: "imaging", searchTerms: ["vascular", "doppler", "vein", "artery"] },
  { id: "other-imaging", label: "Other Imaging", group: "imaging", searchTerms: ["imaging", "radiology"] },

  { id: "blood-test", label: "Blood Tests", group: "laboratory", searchTerms: ["blood", "serum", "haematology", "pathology"] },
  { id: "urine-test", label: "Urine Tests", group: "laboratory", searchTerms: ["urine", "urinalysis", "culture"] },
  { id: "other-lab", label: "Other Laboratory Tests", group: "laboratory", searchTerms: ["lab", "laboratory", "microbiology"] },

  { id: "checkup-package", label: "Health Checkup Packages", group: "other", searchTerms: ["package", "checkup", "check-up", "screening", "full body"] },
  { id: "doctor-appointment", label: "Doctor Appointments", group: "other", searchTerms: ["doctor", "consultation", "opd", "appointment"] },
  { id: "other-service", label: "Other Hospital Services", group: "other", searchTerms: ["service"] },
];

export const serviceCategoriesById: ReadonlyMap<string, ServiceCategory> = new Map(
  serviceCategories.map((category) => [category.id, category]),
);

/**
 * Catalogue entries. `requiresPrescription` is MEDIPAL's own booking policy and
 * is overridable per hospital via `HospitalService`; it is not a statement about
 * any individual hospital's internal rules.
 */
export const services: readonly Service[] = [
  /* ---------------- Scans & Imaging ---------------- */
  {
    id: "ct-head",
    name: "CT Scan — Head / Brain",
    categoryId: "ct",
    group: "imaging",
    kind: "scan",
    summary: "Cross-sectional imaging of the head using X-rays and computer processing.",
    description:
      "A CT (computed tomography) scan of the head uses a rotating X-ray source and computer processing to build cross-sectional images of the brain, skull and surrounding structures. A radiologist reviews the images and issues a report.",
  },
  {
    id: "ct-chest",
    name: "CT Scan — Chest",
    categoryId: "ct",
    group: "imaging",
    kind: "scan",
    summary: "Cross-sectional imaging of the chest, lungs and mediastinum.",
    description:
      "A CT scan of the chest produces cross-sectional images of the lungs, airways, blood vessels and chest wall. The scan is performed in a CT suite and reported by a radiologist.",
  },
  {
    id: "ct-abdomen-pelvis",
    name: "CT Scan — Abdomen & Pelvis",
    categoryId: "ct",
    group: "imaging",
    kind: "scan",
    summary: "Cross-sectional imaging of the abdomen and pelvic organs.",
    description:
      "A CT scan of the abdomen and pelvis produces cross-sectional images of the abdominal and pelvic organs. Some protocols use an intravenous contrast agent; the hospital confirms whether contrast applies to your scan.",
  },
  {
    id: "mri-brain",
    name: "MRI — Brain",
    categoryId: "mri",
    group: "imaging",
    kind: "scan",
    summary: "Detailed imaging of the brain using magnetic fields and radio waves.",
    description:
      "An MRI (magnetic resonance imaging) scan of the brain uses strong magnetic fields and radio waves to produce detailed images of brain tissue. MRI does not use ionising radiation. A radiologist reports the study.",
  },
  {
    id: "mri-spine",
    name: "MRI — Spine",
    categoryId: "mri",
    group: "imaging",
    kind: "scan",
    summary: "Detailed imaging of the spine and spinal cord.",
    description:
      "An MRI of the spine produces detailed images of the vertebral column, discs and spinal cord. The hospital confirms which spinal levels are included for your referral.",
  },
  {
    id: "mri-joint",
    name: "MRI — Joint",
    categoryId: "mri",
    group: "imaging",
    kind: "scan",
    summary: "Detailed imaging of a joint, including soft tissue and cartilage.",
    description:
      "An MRI of a joint produces detailed images of bones, cartilage, ligaments and surrounding soft tissue. The hospital confirms which joint is covered for your referral.",
  },
  {
    id: "usg-abdomen-pelvis",
    name: "Ultrasound — Abdomen & Pelvis",
    categoryId: "ultrasound",
    group: "imaging",
    kind: "scan",
    summary: "Real-time imaging of abdominal and pelvic organs using sound waves.",
    description:
      "An ultrasound (sonography) examination uses high-frequency sound waves to produce real-time images of abdominal and pelvic organs. A sonographer or radiologist performs and reports the study.",
  },
  {
    id: "usg-obstetric",
    name: "Ultrasound — Obstetric",
    categoryId: "ultrasound",
    group: "imaging",
    kind: "scan",
    summary: "Ultrasound examination performed during pregnancy.",
    description:
      "An obstetric ultrasound uses sound waves to image the pregnancy. Which trimester-specific measurements are taken is decided by the treating clinician and the hospital.",
  },
  {
    id: "usg-thyroid",
    name: "Ultrasound — Thyroid & Neck",
    categoryId: "ultrasound",
    group: "imaging",
    kind: "scan",
    summary: "Ultrasound examination of the thyroid gland and neck.",
    description:
      "An ultrasound of the thyroid and neck uses sound waves to image the thyroid gland and adjacent neck structures. The study is reported by the hospital's radiology service.",
  },
  {
    id: "xray-chest",
    name: "X-Ray — Chest",
    categoryId: "xray",
    group: "imaging",
    kind: "scan",
    summary: "Single-projection radiograph of the chest.",
    description:
      "A chest X-ray is a plain radiograph of the chest taken in a radiology room. The number of views required (for example PA, lateral) is decided by the hospital based on the referral.",
  },
  {
    id: "xray-limb",
    name: "X-Ray — Limb / Bone",
    categoryId: "xray",
    group: "imaging",
    kind: "scan",
    summary: "Plain radiograph of an arm, leg, hand or foot.",
    description:
      "A limb X-ray is a plain radiograph of the specified bone or joint. The hospital confirms which views are taken for your referral.",
  },
  {
    id: "xray-spine",
    name: "X-Ray — Spine",
    categoryId: "xray",
    group: "imaging",
    kind: "scan",
    summary: "Plain radiograph of the cervical, thoracic or lumbar spine.",
    description:
      "A spinal X-ray is a plain radiograph of the specified spinal region. The hospital confirms the region and number of views for your referral.",
  },
  {
    id: "mammography-bilateral",
    name: "Mammography — Bilateral",
    categoryId: "mammography",
    group: "imaging",
    kind: "scan",
    summary: "Low-dose X-ray imaging of both breasts.",
    description:
      "Bilateral mammography uses low-dose X-rays to image both breasts. A radiologist reports the study. The hospital confirms whether additional views are required.",
  },
  {
    id: "dexa-bone-density",
    name: "DEXA — Bone Density Scan",
    categoryId: "dexa",
    group: "imaging",
    kind: "scan",
    summary: "Low-dose X-ray measurement of bone mineral density.",
    description:
      "A DEXA scan measures bone mineral density using two low-dose X-ray beams. The hospital confirms which sites are measured for your referral.",
  },
  {
    id: "ecg",
    name: "ECG — Electrocardiogram",
    categoryId: "heart-scan",
    group: "imaging",
    kind: "test",
    summary: "Recording of the heart's electrical activity.",
    description:
      "An ECG records the electrical activity of the heart using surface electrodes. It is a short, non-invasive recording, interpreted by a clinician at the hospital.",
  },
  {
    id: "echo-2d",
    name: "2D Echocardiography",
    categoryId: "heart-scan",
    group: "imaging",
    kind: "scan",
    summary: "Ultrasound imaging of the heart's structure and function.",
    description:
      "A 2D echocardiogram uses ultrasound to image the heart's chambers, valves and wall motion. A cardiologist or trained sonographer performs and reports the study.",
  },
  {
    id: "tmt",
    name: "TMT — Treadmill Stress Test",
    categoryId: "heart-scan",
    group: "imaging",
    kind: "test",
    summary: "Cardiac stress testing performed on a treadmill.",
    description:
      "A treadmill test (TMT) records the heart's electrical activity while you walk on a treadmill under supervision. The hospital decides whether this test is appropriate for you.",
  },
  {
    id: "doppler-lower-limb",
    name: "Doppler — Lower Limb Arterial / Venous",
    categoryId: "vascular-scan",
    group: "imaging",
    kind: "scan",
    summary: "Ultrasound assessment of blood flow in the legs.",
    description:
      "A lower limb Doppler study uses ultrasound to assess blood flow in the arteries or veins of the legs. The hospital confirms whether the arterial or venous study is intended.",
  },
  {
    id: "doppler-carotid",
    name: "Doppler — Carotid",
    categoryId: "vascular-scan",
    group: "imaging",
    kind: "scan",
    summary: "Ultrasound assessment of blood flow in the neck arteries.",
    description:
      "A carotid Doppler study uses ultrasound to assess blood flow in the arteries of the neck. The study is reported by the hospital's radiology service.",
  },

  /* ---------------- Laboratory ---------------- */
  {
    id: "lab-cbc",
    name: "Complete Blood Count (CBC)",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Measures red cells, white cells, haemoglobin and platelets.",
    description:
      "A complete blood count measures red blood cell indices, white blood cell counts, haemoglobin and platelets from a blood sample. The sample is analysed in the hospital laboratory and reported by a pathologist.",
  },
  {
    id: "lab-blood-sugar-fasting",
    name: "Blood Sugar — Fasting",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Measures blood glucose after a fasting period.",
    description:
      "A fasting blood sugar test measures glucose concentration in a blood sample taken after a fasting period. The hospital confirms the fasting duration it requires for your test.",
  },
  {
    id: "lab-hba1c",
    name: "HbA1c — Glycated Haemoglobin",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Reflects average blood glucose over the preceding weeks.",
    description:
      "HbA1c measures glycated haemoglobin, which reflects average blood glucose over the preceding weeks. It is measured from a blood sample in the hospital laboratory.",
  },
  {
    id: "lab-lipid-profile",
    name: "Lipid Profile",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Measures cholesterol and triglyceride levels.",
    description:
      "A lipid profile measures total cholesterol, HDL, LDL and triglycerides from a blood sample. The hospital confirms whether fasting is required for your test.",
  },
  {
    id: "lab-liver-function",
    name: "Liver Function Test (LFT)",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Panel of blood tests assessing liver function.",
    description:
      "A liver function test measures a panel of enzymes, proteins and bilirubin from a blood sample. The exact analyte list is set by the hospital laboratory.",
  },
  {
    id: "lab-kidney-function",
    name: "Kidney Function Test (KFT)",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Panel of blood tests assessing kidney function.",
    description:
      "A kidney function test measures urea, creatinine and related analytes from a blood sample. The exact analyte list is set by the hospital laboratory.",
  },
  {
    id: "lab-thyroid-profile",
    name: "Thyroid Profile (T3, T4, TSH)",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Measures thyroid hormone levels in the blood.",
    description:
      "A thyroid profile measures T3, T4 and TSH from a blood sample. The hospital laboratory sets which assays are included in its profile.",
  },
  {
    id: "lab-vitamin-d",
    name: "Vitamin D (25-OH)",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Measures 25-hydroxy vitamin D in the blood.",
    description:
      "A vitamin D test measures 25-hydroxy vitamin D from a blood sample. Availability and assay method depend on the hospital laboratory.",
  },
  {
    id: "lab-vitamin-b12",
    name: "Vitamin B12",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Measures vitamin B12 in the blood.",
    description:
      "A vitamin B12 test measures cobalamin levels from a blood sample. Availability depends on the hospital laboratory.",
  },
  {
    id: "lab-blood-grouping",
    name: "Blood Grouping & Rh Typing",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Determines ABO blood group and Rh factor.",
    description:
      "Blood grouping determines ABO group and Rh factor from a blood sample. The result is reported by the hospital laboratory.",
  },
  {
    id: "lab-crp",
    name: "CRP — C-Reactive Protein",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Measures C-reactive protein, a marker of inflammation.",
    description:
      "A CRP test measures C-reactive protein in a blood sample. The hospital laboratory reports the value with its reference range.",
  },
  {
    id: "lab-esr",
    name: "ESR — Erythrocyte Sedimentation Rate",
    categoryId: "blood-test",
    group: "laboratory",
    kind: "test",
    summary: "Measures the sedimentation rate of red blood cells.",
    description:
      "An ESR test measures how quickly red blood cells settle in a sample. The hospital laboratory reports the value with its reference range.",
  },
  {
    id: "lab-urine-routine",
    name: "Urine Routine & Microscopy",
    categoryId: "urine-test",
    group: "laboratory",
    kind: "test",
    summary: "Physical, chemical and microscopic examination of a urine sample.",
    description:
      "Urine routine examination covers physical and chemical analysis plus microscopy of a urine sample. The hospital confirms how the sample must be collected.",
  },
  {
    id: "lab-urine-culture",
    name: "Urine Culture & Sensitivity",
    categoryId: "urine-test",
    group: "laboratory",
    kind: "test",
    summary: "Microbiological culture of a urine sample.",
    description:
      "A urine culture and sensitivity test identifies bacterial growth in a urine sample and tests antibiotic response. Turnaround depends on the hospital microbiology laboratory.",
  },
  {
    id: "lab-stool-routine",
    name: "Stool Routine & Microscopy",
    categoryId: "other-lab",
    group: "laboratory",
    kind: "test",
    summary: "Microscopic examination of a stool sample.",
    description:
      "Stool routine examination covers microscopic analysis of a stool sample. The hospital confirms sample collection requirements.",
  },

  /* ---------------- Other configured services ---------------- */
  {
    id: "pkg-basic-health-checkup",
    name: "Basic Health Checkup Package",
    categoryId: "checkup-package",
    group: "other",
    kind: "package",
    summary: "Screening package combining common blood and urine investigations.",
    description:
      "A screening package that bundles several common laboratory investigations into one booking. The hospital confirms which investigations its version of this package includes and whether fasting applies.",
  },
  {
    id: "pkg-comprehensive-health-checkup",
    name: "Comprehensive Health Checkup Package",
    categoryId: "checkup-package",
    group: "other",
    kind: "package",
    summary: "Wider screening package covering blood, urine and cardiac screening.",
    description:
      "A wider screening package spanning haematology, biochemistry, urine analysis and cardiac screening. The hospital confirms the exact analyte list and any preparation it requires.",
  },
  {
    id: "pkg-cardiac-screening",
    name: "Cardiac Screening Package",
    categoryId: "checkup-package",
    group: "other",
    kind: "package",
    summary: "Cardiac-focused screening combining ECG, echo and laboratory tests.",
    description:
      "A cardiac-focused screening package. The hospital confirms which cardiac investigations its version includes and whether a cardiology consultation is part of it.",
  },
  {
    id: "opd-general-medicine",
    name: "Doctor Appointment — General Medicine",
    categoryId: "doctor-appointment",
    group: "other",
    kind: "appointment",
    summary: "Outpatient consultation with a general medicine physician.",
    description:
      "An outpatient consultation slot with a general medicine physician. Availability and consulting hours are set by the hospital and only appear here when the hospital has published them to MEDIPAL.",
  },
  {
    id: "opd-orthopaedics",
    name: "Doctor Appointment — Orthopaedics",
    categoryId: "doctor-appointment",
    group: "other",
    kind: "appointment",
    summary: "Outpatient consultation with an orthopaedic specialist.",
    description:
      "An outpatient consultation slot with an orthopaedic specialist. Availability and consulting hours are set by the hospital and only appear here when the hospital has published them to MEDIPAL.",
  },
  {
    id: "opd-cardiology",
    name: "Doctor Appointment — Cardiology",
    categoryId: "doctor-appointment",
    group: "other",
    kind: "appointment",
    summary: "Outpatient consultation with a cardiologist.",
    description:
      "An outpatient consultation slot with a cardiologist. Availability and consulting hours are set by the hospital and only appear here when the hospital has published them to MEDIPAL.",
  },
];

export const servicesById: ReadonlyMap<string, Service> = new Map(
  services.map((service) => [service.id, service]),
);

/**
 * Component tests. Only defined for packages that bundle services that already
 * exist in this catalogue, so no component is invented. Packages deliberately
 * carry no price of their own until an administrator verifies one.
 */
export const serviceComponents: readonly ServiceComponent[] = [
  { id: "cmp-basic-1", serviceId: "pkg-basic-health-checkup", name: "Complete Blood Count (CBC)", note: null },
  { id: "cmp-basic-2", serviceId: "pkg-basic-health-checkup", name: "Blood Sugar — Fasting", note: null },
  { id: "cmp-basic-3", serviceId: "pkg-basic-health-checkup", name: "Lipid Profile", note: null },
  { id: "cmp-basic-4", serviceId: "pkg-basic-health-checkup", name: "Urine Routine & Microscopy", note: null },

  { id: "cmp-comp-1", serviceId: "pkg-comprehensive-health-checkup", name: "Complete Blood Count (CBC)", note: null },
  { id: "cmp-comp-2", serviceId: "pkg-comprehensive-health-checkup", name: "HbA1c — Glycated Haemoglobin", note: null },
  { id: "cmp-comp-3", serviceId: "pkg-comprehensive-health-checkup", name: "Lipid Profile", note: null },
  { id: "cmp-comp-4", serviceId: "pkg-comprehensive-health-checkup", name: "Liver Function Test (LFT)", note: null },
  { id: "cmp-comp-5", serviceId: "pkg-comprehensive-health-checkup", name: "Kidney Function Test (KFT)", note: null },
  { id: "cmp-comp-6", serviceId: "pkg-comprehensive-health-checkup", name: "Thyroid Profile (T3, T4, TSH)", note: null },
  { id: "cmp-comp-7", serviceId: "pkg-comprehensive-health-checkup", name: "Urine Routine & Microscopy", note: null },
  { id: "cmp-comp-8", serviceId: "pkg-comprehensive-health-checkup", name: "ECG — Electrocardiogram", note: null },

  { id: "cmp-card-1", serviceId: "pkg-cardiac-screening", name: "ECG — Electrocardiogram", note: null },
  { id: "cmp-card-2", serviceId: "pkg-cardiac-screening", name: "2D Echocardiography", note: null },
  { id: "cmp-card-3", serviceId: "pkg-cardiac-screening", name: "Lipid Profile", note: null },
];

export const serviceComponentsByServiceId: ReadonlyMap<string, readonly ServiceComponent[]> =
  serviceComponents.reduce((map, component) => {
    const existing = map.get(component.serviceId) ?? [];
    map.set(component.serviceId, [...existing, component]);
    return map;
  }, new Map<string, ServiceComponent[]>());

/** A single-test service includes exactly itself. */
export function testsIncludedCount(service: Service): number {
  if (service.kind === "package") {
    return serviceComponentsByServiceId.get(service.id)?.length ?? 0;
  }
  return 1;
}

/**
 * MEDIPAL booking policy default. Imaging studies normally need a referral, so
 * they are flagged here; an administrator can override this per hospital.
 */
export function defaultRequiresPrescription(service: Service): boolean {
  return service.kind === "scan";
}
