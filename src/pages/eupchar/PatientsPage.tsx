import { useState } from "react";
import { CalendarPlus, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice, EuSectionTitle } from "@/components/eupchar/ui";
import { AddPatientForm } from "@/components/eupchar/AddPatientForm";
import { PatientPicker } from "@/components/eupchar/PatientPicker";
import { selectPatients, requestPatientDeletion } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { ageFromDateOfBirth, formatDate, initialsFromName } from "@/lib/eupchar/format";

export default function PatientsPage() {
  const state = useEuState();
  const patients = selectPatients(state);
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <EuShell>
      <EuPageHeader
        eyebrow="E-UPCHAR"
        title="My Patients"
        description="The people you book for. Identity references are optional and always stored masked — only the last four digits are ever kept."
        actions={
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            className="eu-btn eu-btn-primary gap-2 px-4 py-2.5 text-[0.85rem]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add patient
          </button>
        }
      />

      {adding && (
        <EuCard className="mb-6 p-5">
          <EuSectionTitle title="Add a patient" description="Full name, date of birth and a mobile number are required." />
          <div className="mt-5">
            <AddPatientForm onCreated={() => setAdding(false)} onCancel={() => setAdding(false)} />
          </div>
        </EuCard>
      )}

      {patients.length === 0 && !adding ? (
        <EuEmptyState
          icon={Users}
          title="No patients saved yet"
          description="Add the person you book for. You can save family members and pick between them at checkout."
          action={
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="eu-btn eu-btn-primary px-4 py-2.5"
            >
              Add your first patient
            </button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {patients.map((patient) => {
            const age = ageFromDateOfBirth(patient.dateOfBirth);
            return (
              <EuCard as="li" key={patient.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-eu-surface text-sm font-semibold text-eu-red-deep">
                    {initialsFromName(patient.fullName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.95rem] font-semibold text-eu-text">{patient.fullName}</p>
                    <p className="text-[0.78rem] text-eu-muted">
                      {age !== null ? `${age} yrs` : "Age not set"} · {patient.gender} · {patient.relationship}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 space-y-1.5 text-[0.78rem]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-eu-muted">Date of birth</dt>
                    <dd className="text-eu-text">{formatDate(patient.dateOfBirth)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-eu-muted">Mobile</dt>
                    <dd className="text-eu-text">{patient.phone}</dd>
                  </div>
                  {patient.email && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-eu-muted">Email</dt>
                      <dd className="truncate text-eu-text">{patient.email}</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-eu-muted">Identity</dt>
                    <dd>
                      {patient.identity ? (
                        <EuBadge tone="ok">
                          <ShieldCheck className="h-3 w-3" aria-hidden />
                          {patient.identity.masked}
                        </EuBadge>
                      ) : (
                        <span className="text-eu-muted">Not provided</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Link
                    to="/e-upchar/hospitals"
                    className="eu-btn eu-btn-secondary gap-1.5 px-3 py-2 text-[0.78rem]"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                    Book for this patient
                  </Link>
                  {pendingDelete === patient.id ? (
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          requestPatientDeletion(patient.id);
                          setPendingDelete(null);
                        }}
                        className="eu-btn eu-btn-quiet px-2.5 py-2 text-[0.78rem] text-eu-red-deep"
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                        className="eu-btn eu-btn-quiet px-2.5 py-2 text-[0.78rem]"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(patient.id)}
                      className="eu-btn eu-btn-quiet gap-1.5 px-2.5 py-2 text-[0.78rem] text-eu-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Delete
                    </button>
                  )}
                </div>
              </EuCard>
            );
          })}
        </ul>
      )}

      {patients.length > 0 && (
        <EuNotice tone="info" className="mt-6" title="Deletion">
          Deleting a patient removes their record and any documents attached to them from this device.
          Bookings already placed with a hospital stay with the hospital.
        </EuNotice>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="eu-btn eu-btn-secondary px-4 py-2.5 text-[0.85rem]"
        >
          Open the patient selector
        </button>
      </div>

      <PatientPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={() => setPickerOpen(false)} />
    </EuShell>
  );
}
