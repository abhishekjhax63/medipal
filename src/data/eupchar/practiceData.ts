/**
 * Practice mode dataset.
 *
 * The owner-supplied Bihar dataset publishes no hospital service catalogue and no
 * prices. So MEDIPAL ships an empty catalogue and offers this explicitly labelled
 * practice dataset instead, letting a reviewer walk the whole booking funnel
 * without MEDIPAL ever pretending a hospital published something it did not.
 *
 * Every record created here carries `verificationStatus: "practice"` or
 * `source: "practice"`, and every screen that renders one must display
 * `PRACTICE_PRICE_LABEL` / `PRACTICE_BANNER`. Nothing here may be presented as a
 * verified hospital price, a real appointment, or a real payment.
 */

import {
  defaultRequiresPrescription,
  services,
} from "@/data/eupchar/serviceCatalog";
import type {
  AppointmentSlot,
  HospitalService,
  PriceSource,
  Service,
  ServicePrice,
} from "@/types/eupchar";

export const PRACTICE_BANNER =
  "Practice mode — MEDIPAL has not been given this hospital's service list or prices. Everything below is a labelled practice placeholder so you can walk through the flow. Nothing here is a hospital offer, a real availability, or a real charge.";

export const PRACTICE_PRICE_LABEL = "Practice amount";
export const PRACTICE_SLOT_LABEL = "Practice slot";

export const practicePriceSource: PriceSource = {
  id: "src-practice",
  name: "MEDIPAL practice mode",
  url: null,
  type: "hospital",
  permitted: true,
  checkedOn: null,
};

/** Stable 32-bit hash so practice data is identical on every reload. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Practice base amount in paise, purely a placeholder for the funnel. */
function practiceBasePaise(service: Service): number {
  const byKind: Record<Service["kind"], number> = {
    scan: 320_000,
    test: 70_000,
    package: 450_000,
    appointment: 50_000,
    other: 200_000,
  };
  const base = byKind[service.kind];
  const spread = hash(service.id) % 90_000;
  return Math.round((base + spread) / 100) * 100;
}

/** 14 practice days starting tomorrow, four morning slots plus three evening. */
const SLOT_HOURS: readonly number[] = [9, 10, 11, 15, 16, 17];

export function buildPracticeHospitalServices(
  hospitalIds: readonly string[],
): readonly HospitalService[] {
  const rows: HospitalService[] = [];
  for (const hospitalId of hospitalIds) {
    for (const service of services) {
      // Deterministic subset so different hospitals genuinely differ.
      const bucket = hash(`${hospitalId}:${service.id}`) % 10;
      if (bucket < 3) continue;
      rows.push({
        id: `hs-practice-${hospitalId}-${service.id}`,
        hospitalId,
        serviceId: service.id,
        available: true,
        requiresPrescription: defaultRequiresPrescription(service),
        reportTurnaround: null,
        preparationInstructions: null,
        prerequisiteServiceIds: [],
      });
    }
  }
  return rows;
}

export function buildPracticeServicePrices(
  hospitalIds: readonly string[],
): readonly ServicePrice[] {
  const rows: ServicePrice[] = [];
  for (const hospitalId of hospitalIds) {
    for (const service of services) {
      if (hash(`${hospitalId}:${service.id}`) % 10 < 3) continue;
      const base = practiceBasePaise(service);
      const hospitalPrice = base + (hash(`${hospitalId}${service.id}p`) % 20_000);
      const taxes = Math.round((hospitalPrice * 5) / 100 / 100) * 100;
      rows.push({
        id: `sp-practice-${hospitalId}-${service.id}`,
        hospitalId,
        serviceId: service.id,
        hospitalPricePaise: hospitalPrice,
        officialOnlinePricePaise: null,
        thirdPartyOnlinePricePaise: null,
        sourceId: practicePriceSource.id,
        sourceName: practicePriceSource.name,
        sourceUrl: null,
        lastVerifiedOn: null,
        staleDetectedOn: null,
        conditions: "Practice placeholder — no hospital has confirmed this amount.",
        taxesAndFeesPaise: taxes,
        finalPayablePaise: hospitalPrice + taxes,
        verificationStatus: "practice",
      });
    }
  }
  return rows;
}

export function buildPracticeSlots(hospitalIds: readonly string[]): readonly AppointmentSlot[] {
  const rows: AppointmentSlot[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const hospitalId of hospitalIds) {
    for (const service of services) {
      for (let day = 1; day <= 14; day += 1) {
        const date = new Date(today.getTime() + day * 86_400_000);
        for (const hour of SLOT_HOURS) {
          if (hash(`${hospitalId}:${service.id}:${day}:${hour}`) % 5 === 0) continue;
          const start = new Date(date);
          start.setHours(hour, 0, 0, 0);
          const end = new Date(start.getTime() + 30 * 60_000);
          rows.push({
            id: `slot-practice-${hospitalId}-${service.id}-${day}-${hour}`,
            hospitalId,
            serviceId: service.id,
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
            capacity: 3,
            booked: hash(`${service.id}${day}${hour}`) % 3,
            heldUntil: null,
            source: "practice",
          });
        }
      }
    }
  }
  return rows;
}
