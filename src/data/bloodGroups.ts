export const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export type BloodGroup = (typeof bloodGroups)[number];

export type BloodGroupInfo = {
  group: BloodGroup;
  /** Red-cell donation compatibility (standard ABO/Rh reference table). */
  canDonateTo: BloodGroup[];
  canReceiveFrom: BloodGroup[];
  /** One-line factual descriptor for the group card. */
  tagline: string;
  summary: string;
};

/**
 * Standard ABO/Rh red-cell compatibility reference.
 * Educational only — local blood services always confirm compatibility clinically.
 */
export const bloodGroupInfo: Record<BloodGroup, BloodGroupInfo> = {
  "O-": {
    group: "O-",
    canDonateTo: ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
    canReceiveFrom: ["O-"],
    tagline: "Universal red-cell donor group.",
    summary:
      "Often described as the universal red-cell donor group because O- red cells can be given to every ABO/Rh group in an emergency.",
  },
  "O+": {
    group: "O+",
    canDonateTo: ["O+", "A+", "B+", "AB+"],
    canReceiveFrom: ["O-", "O+"],
    tagline: "Donates to all Rh-positive groups.",
    summary:
      "O+ red cells are compatible with all Rh-positive recipients across the ABO groups.",
  },
  "A-": {
    group: "A-",
    canDonateTo: ["A-", "A+", "AB-", "AB+"],
    canReceiveFrom: ["O-", "A-"],
    tagline: "Donates to A and AB recipients.",
    summary: "A- red cells suit A and AB recipients, and can be received by A- patients.",
  },
  "A+": {
    group: "A+",
    canDonateTo: ["A+", "AB+"],
    canReceiveFrom: ["O-", "O+", "A-", "A+"],
    tagline: "Donates to A+ and AB+ recipients.",
    summary: "A+ red cells are compatible with A+ and AB+ recipients.",
  },
  "B-": {
    group: "B-",
    canDonateTo: ["B-", "B+", "AB-", "AB+"],
    canReceiveFrom: ["O-", "B-"],
    tagline: "Donates to B and AB recipients.",
    summary: "B- red cells suit B and AB recipients, and can be received by B- patients.",
  },
  "B+": {
    group: "B+",
    canDonateTo: ["B+", "AB+"],
    canReceiveFrom: ["O-", "O+", "B-", "B+"],
    tagline: "Donates to B+ and AB+ recipients.",
    summary: "B+ red cells are compatible with B+ and AB+ recipients.",
  },
  "AB-": {
    group: "AB-",
    canDonateTo: ["AB-", "AB+"],
    canReceiveFrom: ["O-", "A-", "B-", "AB-"],
    tagline: "Donates to AB recipients only.",
    summary: "AB- red cells are compatible with AB recipients, and AB- patients can receive from all Rh-negative groups.",
  },
  "AB+": {
    group: "AB+",
    canDonateTo: ["AB+"],
    canReceiveFrom: ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
    tagline: "Universal red-cell recipient group.",
    summary:
      "Often described as the universal red-cell recipient group because AB+ patients can receive red cells from every ABO/Rh group.",
  },
};

export const bloodGroupNote =
  "Blood group distribution varies between regions and populations. Compatibility shown here follows the standard ABO/Rh red-cell reference and should always be confirmed by an authorised blood service or clinician.";

export const indianStates = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export const contactMethods = ["Phone", "Email", "WhatsApp"] as const;

export type ContactMethod = (typeof contactMethods)[number];
