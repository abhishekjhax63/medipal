import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { EASE_SMOOTH } from "@/lib/animations";
import { ageFromDateOfBirth, initialsFromName } from "@/lib/eupchar/format";
import { selectPatients } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import type { Patient } from "@/types/eupchar";
import { AddPatientForm } from "@/components/eupchar/AddPatientForm";
import { EuEmptyState } from "@/components/eupchar/ui";

/** Compact patient line — never renders a full identity value. */
export function PatientRow({
  patient,
  selected = false,
  onSelect,
}: {
  patient: Patient;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const age = ageFromDateOfBirth(patient.dateOfBirth);
  const Tag = onSelect ? "button" : "div";
  return (
    <Tag
      {...(onSelect ? { type: "button" as const, onClick: onSelect } : {})}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 ease-smooth",
        selected
          ? "border-eu-red bg-[#fdf0ed]"
          : onSelect
            ? "border-eu-border bg-eu-bg hover:border-[#c9ccd0] hover:shadow-eu-card"
            : "border-eu-border bg-eu-bg",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-eu-surface text-[0.78rem] font-semibold text-eu-red-deep">
        {initialsFromName(patient.fullName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-eu-text">{patient.fullName}</span>
        <span className="block truncate text-[0.75rem] text-eu-muted">
          {age !== null ? `${age} yrs` : "Age not set"} · {patient.gender} · {patient.relationship}
        </span>
      </span>
      {patient.identity && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#bfe3ce] bg-[#eefaf2] px-2 py-0.5 text-[0.65rem] font-semibold text-eu-ok"
          title={patient.identity.masked}
        >
          <ShieldCheck className="h-3 w-3" aria-hidden />
          ID on file
        </span>
      )}
    </Tag>
  );
}

/**
 * Select-or-add patient. Presented as a bottom sheet on small screens and a
 * centred dialog from `sm` upward (spec §10). Focus stays manageable and the
 * full identity value is never rendered.
 */
export function PatientPicker({
  open,
  onClose,
  onSelect,
  currentPatientId,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (patient: Patient) => void;
  currentPatientId?: string | null;
}) {
  const state = useEuState();
  const patients = selectPatients(state);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) setAdding(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="Close patient selector"
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Select or add a patient"
            className="eu-scope relative flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-3xl border border-eu-border bg-eu-bg shadow-2xl sm:max-w-lg sm:rounded-3xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE_SMOOTH }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-eu-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-eu-red" aria-hidden />
                <h2 className="text-[0.95rem] font-semibold text-eu-text">
                  {adding ? "Add a patient" : "Who is this booking for?"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="eu-btn eu-btn-quiet h-8 w-8 justify-center rounded-full p-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {adding ? (
                <AddPatientForm
                  onCreated={(patient) => {
                    setAdding(false);
                    onSelect(patient);
                  }}
                  onCancel={() => setAdding(false)}
                />
              ) : patients.length === 0 ? (
                <EuEmptyState
                  icon={UserPlus}
                  title="No patients saved yet"
                  description="Add the person you are booking for. You can add family members and switch between them later."
                  action={
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="eu-btn eu-btn-primary gap-2 px-4 py-2.5"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Add patient
                    </button>
                  }
                />
              ) : (
                <div className="space-y-2.5">
                  {patients.map((patient) => (
                    <PatientRow
                      key={patient.id}
                      patient={patient}
                      selected={patient.id === currentPatientId}
                      onSelect={() => onSelect(patient)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="eu-btn eu-btn-secondary w-full justify-center gap-2 px-4 py-2.5"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add another patient
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
