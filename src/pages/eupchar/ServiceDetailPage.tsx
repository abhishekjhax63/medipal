import { useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  Compass,
  FileText,
  Info,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuCard, EuEmptyState, EuNotice, EuPrice, EuPriceProvenance } from "@/components/eupchar/ui";
import { PatientPicker, PatientRow } from "@/components/eupchar/PatientPicker";
import { PracticeModeExplainer } from "@/components/eupchar/PracticeModeToggle";
import { testsIncludedCount } from "@/data/eupchar/serviceCatalog";
import { selectHospital, selectHospitalServiceView, selectPatient } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { useEupcharBooking } from "@/context/EupcharBookingContext";
import { formatPhone } from "@/lib/eupchar/format";
import { E_UPCHAR_COPY } from "@/types/eupchar";

export default function ServiceDetailPage() {
  const { serviceId = "" } = useParams();
  const [params] = useSearchParams();
  const hospitalId = params.get("hospital") ?? "";
  const navigate = useNavigate();
  const state = useEuState();
  const { draft, patchDraft } = useEupcharBooking();
  const [pickerOpen, setPickerOpen] = useState(false);

  const hospital = selectHospital(hospitalId, state);
  const view = useMemo(
    () => (hospitalId && serviceId ? selectHospitalServiceView(hospitalId, serviceId, state) : null),
    [hospitalId, serviceId, state],
  );
  const selectedPatient = selectPatient(draft.patientId, state);
  const includedCount = view ? testsIncludedCount(view.service) : 0;

  if (!view || !hospital) {
    return (
      <EuShell>
        <EuEmptyState
          icon={Info}
          title="Service not available here"
          description="This service is not currently configured for that hospital. Open the hospital's page and choose a service from its own list."
          action={
            <Link
              to={hospitalId ? `/e-upchar/hospitals/${hospitalId}` : "/e-upchar/hospitals"}
              className="eu-btn eu-btn-primary px-4 py-2.5"
            >
              Back to hospital services
            </Link>
          }
        />
      </EuShell>
    );
  }

  const phone = formatPhone(hospital.phone);

  function startBooking() {
    if (!draft.patientId) {
      setPickerOpen(true);
      return;
    }
    patchDraft({ hospitalId: hospital!.id, serviceId: view!.service.id });
    navigate("/e-upchar/checkout");
  }

  return (
    <EuShell>
      <EuPageHeader
        eyebrow={view.category.label}
        title={view.service.name}
        description={view.service.summary}
        breadcrumb={[
          { label: "E-UPCHAR", to: "/e-upchar" },
          { label: "Hospitals", to: "/e-upchar/hospitals" },
          { label: hospital.name, to: `/e-upchar/hospitals/${hospital.id}` },
          { label: view.service.name },
        ]}
      />

      <PracticeModeExplainer className="mb-5" />

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-4">
          <Section title="About Test" defaultOpen>
            <p className="leading-relaxed text-eu-muted">{view.service.description}</p>
          </Section>

          <Section title="Test Preparation">
            {view.hospitalService.preparationInstructions ? (
              <p className="leading-relaxed text-eu-muted">{view.hospitalService.preparationInstructions}</p>
            ) : (
              <EuNotice tone="warn">{E_UPCHAR_COPY.preparationFallback}</EuNotice>
            )}
          </Section>

          <Section title={`Tests Included${includedCount > 0 ? ` (${includedCount})` : ""}`}>
            {view.components.length > 0 ? (
              <ul className="space-y-2">
                {view.components.map((component) => (
                  <li key={component.id} className="flex items-start gap-2 text-sm text-eu-muted">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-eu-ok" aria-hidden />
                    <span>
                      <span className="text-eu-text">{component.name}</span>
                      {component.note ? ` — ${component.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="leading-relaxed text-eu-muted">
                This hospital has not published the list of tests included in this service. Please
                confirm the exact components with the hospital before booking.
              </p>
            )}
          </Section>

          <Section title="Important Instructions">
            <ul className="space-y-2 text-sm leading-relaxed text-eu-muted">
              <li>· MEDIPAL has not been given this hospital's own instructions for this service.</li>
              <li>· {E_UPCHAR_COPY.preparationFallback}</li>
              {view.hospitalService.requiresPrescription && (
                <li>· A doctor's prescription is required — you can upload it during checkout.</li>
              )}
              <li>· Bring a valid photo ID. For PM-JAY, also carry your Ayushman card.</li>
              {phone && (
                <li>
                  · Questions before you go?{" "}
                  <a href={`tel:${hospital.phone}`} className="font-medium text-eu-red-deep hover:underline">
                    Call {phone}
                  </a>
                </li>
              )}
            </ul>
          </Section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <EuCard className="p-5">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">
              Price at this hospital
            </p>
            <div className="mt-2">
              <EuPrice paise={view.displayPricePaise} status={view.priceStatus} size="lg" />
            </div>
            <EuPriceProvenance price={view.price} />
            {view.priceStatus === "unverified" && (
              <p className="mt-2 text-[0.78rem] leading-relaxed text-eu-muted">
                No verified or published price exists for this service here, so payment cannot be
                started. Contact the hospital for the current amount.
              </p>
            )}
            {view.priceStatus === "awaiting_confirmation" && (
              <p className="mt-2 text-[0.78rem] leading-relaxed text-eu-muted">
                A price has been recorded but the provider has not confirmed it, so it cannot be
                charged online. Contact the hospital to confirm the current amount.
              </p>
            )}

            <div className="mt-4 space-y-2 border-t border-eu-border pt-4 text-[0.8rem]">
              <div className="flex items-center gap-2 text-eu-muted">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                <span className="text-eu-text">{hospital.name}</span>
              </div>
              <div className="flex items-center gap-2 text-eu-muted">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                <span>
                  {state.practiceMode
                    ? "Practice appointment times are available"
                    : "Appointment scheduling is not connected"}
                </span>
              </div>
              {view.hospitalService.requiresPrescription && (
                <div className="flex items-center gap-2 text-eu-muted">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  <span>Prescription required</span>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-2.5">
              {selectedPatient ? (
                <div className="rounded-2xl border border-eu-border bg-eu-surface p-3">
                  <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">
                    Booking for
                  </p>
                  <PatientRow patient={selectedPatient} />
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="eu-btn eu-btn-quiet mt-2 w-full justify-center px-3 py-1.5 text-[0.78rem]"
                  >
                    Change patient
                  </button>
                </div>
              ) : (
                <EuNotice tone="info" title="No patient selected yet">
                  Choose who this booking is for. You can add a family member in the same step.
                </EuNotice>
              )}

              <button type="button" onClick={startBooking} className="eu-btn eu-btn-primary w-full justify-center gap-2 px-4 py-3">
                <UserRound className="h-4 w-4" aria-hidden />
                {selectedPatient ? "Continue to checkout" : "Select Patient"}
              </button>

              <Link
                to="/e-upchar/prescription"
                className="eu-btn eu-btn-secondary w-full justify-center gap-2 px-4 py-2.5 text-[0.85rem]"
              >
                <FileText className="h-4 w-4" aria-hidden />
                {E_UPCHAR_COPY.prescriptionHeading}
              </Link>

              <div className="flex gap-2">
                <Link
                  to={`/e-upchar/directions/${hospital.id}`}
                  className="eu-btn eu-btn-quiet flex-1 justify-center gap-1.5 px-3 py-2 text-[0.8rem]"
                >
                  <Compass className="h-3.5 w-3.5" aria-hidden />
                  Directions
                </Link>
                {phone && (
                  <a
                    href={`tel:${hospital.phone}`}
                    className="eu-btn eu-btn-quiet flex-1 justify-center gap-1.5 px-3 py-2 text-[0.8rem]"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    Call
                  </a>
                )}
              </div>
            </div>
          </EuCard>

          {view.priceStatus === "practice" && (
            <EuNotice tone="practice" title="Practice amount in effect">
              The amount shown is a labelled practice placeholder, not a hospital price. Nothing will
              be charged against it.
            </EuNotice>
          )}
        </aside>
      </div>

      <PatientPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentPatientId={draft.patientId}
        onSelect={(patient) => {
          patchDraft({ patientId: patient.id, hospitalId: hospital.id, serviceId: view.service.id });
          setPickerOpen(false);
          navigate("/e-upchar/checkout");
        }}
      />
    </EuShell>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-eu-border bg-eu-bg px-5 py-4 shadow-eu-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.95rem] font-semibold text-eu-text">
        {title}
        <Plus className="h-4 w-4 shrink-0 text-eu-muted transition-transform duration-300 group-open:rotate-45" aria-hidden />
      </summary>
      <div className="mt-3 text-sm">{children}</div>
    </details>
  );
}
