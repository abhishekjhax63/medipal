import { useCallback, useSyncExternalStore } from "react";
import { getEupcharSnapshot, selectAllHospitals, subscribeEupchar } from "@/services/eupchar/repository";
import type { Booking, EUpcharState, Hospital, Patient } from "@/types/eupchar";

export type EuStore = EUpcharState & {
  hospitals: Hospital[];
  isLoading: boolean;
  error: string | null;
  fetchHospitals: (_params?: URLSearchParams) => Promise<void>;
  fetchPatients: () => Promise<void>;
  fetchBookings: () => Promise<void>;
  createBooking: (_input: unknown) => Promise<Booking | null>;
  createPatient: (_input: unknown) => Promise<Patient | null>;
};

/** Reactive wrapper around the intentionally transient E-UPCHAR read model. */
export function useEuStore(): EuStore {
  const snapshot = useSyncExternalStore(subscribeEupchar, getEupcharSnapshot, getEupcharSnapshot);
  const fetchHospitals = useCallback(async () => undefined, []);
  const fetchPatients = useCallback(async () => undefined, []);
  const fetchBookings = useCallback(async () => undefined, []);
  const unavailableBooking = useCallback(async () => null, []);
  const unavailablePatient = useCallback(async () => null, []);
  return {
    ...snapshot,
    hospitals: selectAllHospitals(snapshot),
    isLoading: false,
    error: null,
    fetchHospitals,
    fetchPatients,
    fetchBookings,
    createBooking: unavailableBooking,
    createPatient: unavailablePatient,
  };
}

/** Backwards-compatible name used by existing E-UPCHAR screens. */
export const useEuState = useEuStore;
export function useEuSelector<T>(selector: (current: EuStore) => T): T { return selector(useEuStore()); }
export function useEuActions() { return useEuStore(); }
