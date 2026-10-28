/**
 * Price recalculation — the authoritative pricing rules.
 *
 * This module is written to run **on the server**. The browser imports the same
 * functions so the displayed figure and the charged figure cannot drift, but the
 * server must be the one that decides the amount: `verifyClientTotal` exists so a
 * client-supplied total is explicitly rejected unless it matches the
 * server-recalculated figure (spec §9, §23).
 *
 * Rules enforced here:
 *  - An unverified price never becomes a chargeable amount.
 *  - A package with its own price is never inflated by adding its components.
 *  - Taxes and fees are always shown as separate lines.
 */

import { resolveDisplayPricePaise } from "@/data/eupchar/directory";
import type {
  BookingItem,
  HospitalService,
  PriceBreakdown,
  PriceVerificationStatus,
  Service,
  ServiceComponent,
  ServicePrice,
} from "@/types/eupchar";

export type PriceInput = {
  service: Service;
  hospitalService: HospitalService;
  price: ServicePrice | null;
  components: readonly ServiceComponent[];
};

export const NO_VERIFIED_PRICE_REASON =
  "No verified price has been recorded for this service at this hospital.";

export const PRICE_AWAITING_CONFIRMATION_REASON =
  "A price has been recorded for this service, but the provider has not confirmed it, so it cannot be charged online.";

export function recalculatePrice(input: PriceInput): PriceBreakdown {
  const { service, price } = input;
  const status: PriceVerificationStatus = price?.verificationStatus ?? "unverified";

  // A figure that is not confirmed, or has no reliable source, is never a price.
  if (status === "unverified" || status === "awaiting_confirmation") {
    return {
      lines: [
        {
          id: `${input.hospitalService.id}-line-1`,
          label: service.name,
          quantity: 1,
          unitPricePaise: null,
          taxesPaise: null,
          feesPaise: null,
          verificationStatus: status,
        },
      ],
      subtotalPaise: null,
      taxesAndFeesPaise: null,
      discountPaise: null,
      totalPayablePaise: null,
      status,
      blockers: [
        status === "awaiting_confirmation"
          ? PRICE_AWAITING_CONFIRMATION_REASON
          : NO_VERIFIED_PRICE_REASON,
      ],
    };
  }

  const payable = resolveDisplayPricePaise(price);
  if (payable === null) {
    return {
      lines: [
        {
          id: `${input.hospitalService.id}-line-1`,
          label: service.name,
          quantity: 1,
          unitPricePaise: null,
          taxesPaise: null,
          feesPaise: null,
          verificationStatus: "unverified",
        },
      ],
      subtotalPaise: null,
      taxesAndFeesPaise: null,
      discountPaise: null,
      totalPayablePaise: null,
      status: "unverified",
      blockers: [NO_VERIFIED_PRICE_REASON],
    };
  }

  // Covered by an applicable programme: nothing is charged, so there is no
  // payment step — but the line still records the service honestly.
  if (status === "free_programme") {
    return {
      lines: [
        {
          id: `${input.hospitalService.id}-line-1`,
          label: service.name,
          quantity: 1,
          unitPricePaise: 0,
          taxesPaise: null,
          feesPaise: null,
          verificationStatus: "free_programme",
        },
      ],
      subtotalPaise: 0,
      taxesAndFeesPaise: null,
      discountPaise: null,
      totalPayablePaise: 0,
      status: "free_programme",
      blockers: [],
    };
  }

  // A package carries its own price — components are informational only and are
  // never summed into the line item.
  const basePaise = price?.hospitalPricePaise ?? payable;
  const taxesAndFeesPaise = price?.taxesAndFeesPaise ?? Math.max(0, payable - basePaise);

  const lines: BookingItem[] = [
    {
      id: `${input.hospitalService.id}-line-1`,
      label: service.name,
      quantity: 1,
      unitPricePaise: basePaise,
      taxesPaise: taxesAndFeesPaise,
      feesPaise: null,
      verificationStatus: status,
    },
  ];

  return {
    lines,
    subtotalPaise: basePaise,
    taxesAndFeesPaise,
    discountPaise: null,
    totalPayablePaise: payable,
    status,
    blockers: [],
  };
}

/**
 * Server-side guard. Returns `false` when the browser claims a total the server
 * did not calculate. The caller must refuse to charge on `false`.
 */
export function verifyClientTotal(
  serverBreakdown: PriceBreakdown,
  clientTotalPaise: number | null,
): boolean {
  return serverBreakdown.totalPayablePaise === clientTotalPaise;
}

/** Human copy for a breakdown's status, shared by checkout and receipts. */
export function breakdownStatusCopy(breakdown: PriceBreakdown): {
  tone: "ok" | "warn" | "muted";
  label: string;
  detail: string;
} {
  switch (breakdown.status) {
    case "verified":
      return {
        tone: "ok",
        label: "Provider-confirmed price",
        detail: "Amount confirmed by the provider for this hospital.",
      };
    case "published":
      return {
        tone: "ok",
        label: "Published price",
        detail:
          "Amount published by the provider's own official source. It is not a separate provider confirmation.",
      };
    case "free_programme":
      return {
        tone: "ok",
        label: "Free under applicable programme",
        detail:
          "This service is covered by an applicable programme, so nothing is charged. Eligibility and participation conditions are shown with the price.",
      };
    case "practice":
      return {
        tone: "warn",
        label: "Practice amount",
        detail:
          "Practice mode is on. This figure is a placeholder created for the walkthrough — it is not a hospital price.",
      };
    case "awaiting_confirmation":
      return {
        tone: "muted",
        label: "Price not confirmed",
        detail: PRICE_AWAITING_CONFIRMATION_REASON,
      };
    default:
      return {
        tone: "muted",
        label: "Price not verified",
        detail: NO_VERIFIED_PRICE_REASON,
      };
  }
}
