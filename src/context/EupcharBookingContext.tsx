/**
 * In-memory booking draft for the E-UPCHAR funnel.
 *
 * Holds only the identifiers needed to carry a visitor from a hospital's service
 * list through to the confirmation screen: hospital, service, patient, chosen
 * slot and an uploaded prescription reference.
 *
 * Deliberately *not* persisted — no `localStorage`, no `sessionStorage`, no URL.
 * A reload therefore drops the draft rather than leaving a half-finished medical
 * booking sitting in browser storage (spec §11).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ScheduleSource } from "@/types/eupchar";

export type BookingDraft = {
  readonly hospitalId: string | null;
  readonly serviceId: string | null;
  readonly patientId: string | null;
  readonly appointmentStartsAt: string | null;
  readonly appointmentEndsAt: string | null;
  readonly scheduleSource: ScheduleSource;
  readonly prescriptionDocumentId: string | null;
  readonly notes: string | null;
};

export const EMPTY_BOOKING_DRAFT: BookingDraft = {
  hospitalId: null,
  serviceId: null,
  patientId: null,
  appointmentStartsAt: null,
  appointmentEndsAt: null,
  scheduleSource: "not_connected",
  prescriptionDocumentId: null,
  notes: null,
};

type EupcharBookingContextValue = {
  draft: BookingDraft;
  patchDraft: (patch: Partial<BookingDraft>) => void;
  resetDraft: () => void;
};

const EupcharBookingContext = createContext<EupcharBookingContextValue | null>(null);

export function EupcharBookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft>(EMPTY_BOOKING_DRAFT);

  const patchDraft = useCallback((patch: Partial<BookingDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const resetDraft = useCallback(() => setDraft(EMPTY_BOOKING_DRAFT), []);

  const value = useMemo<EupcharBookingContextValue>(
    () => ({ draft, patchDraft, resetDraft }),
    [draft, patchDraft, resetDraft],
  );

  return <EupcharBookingContext.Provider value={value}>{children}</EupcharBookingContext.Provider>;
}

export function useEupcharBooking(): EupcharBookingContextValue {
  const context = useContext(EupcharBookingContext);
  if (!context) {
    throw new Error("useEupcharBooking must be used inside an <EupcharBookingProvider>");
  }
  return context;
}
