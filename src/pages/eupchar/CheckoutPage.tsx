import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import {
  EuCard,
  EuEmptyState,
  EuNotice,
  EuPrice,
  EuSectionTitle,
  EuStepper,
} from "@/components/eupchar/ui";
import { PatientPicker, PatientRow } from "@/components/eupchar/PatientPicker";
import { PrescriptionUpload } from "@/components/eupchar/PrescriptionUpload";
import { SlotPicker } from "@/components/eupchar/SlotPicker";
import { bookingPolicy, integrationReadiness } from "@/services/eupchar/config";
import {
  attachPayment,
  createBooking,
  issueInvoice,
  selectHospital,
  selectHospitalServiceView,
  selectPatient,
  setBookingStatus,
} from "@/services/eupchar/repository";
import { createPaymentOrder, loadRazorpayCheckout, verifyPayment } from "@/services/eupchar/gateway";
import { breakdownStatusCopy, recalculatePrice } from "@/services/eupchar/pricing";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { useEupcharBooking } from "@/context/EupcharBookingContext";
import { formatPaise } from "@/lib/eupchar/format";
import type { Booking, ScheduleSource } from "@/types/eupchar";
import { E_UPCHAR_COPY } from "@/types/eupchar";

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayHandlerResponse) => void;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
};

export default function CheckoutPage() {
  const state = useEuState();
  const navigate = useNavigate();
  const { draft, patchDraft, resetDraft } = useEupcharBooking();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hospital = selectHospital(draft.hospitalId, state);
  const view = useMemo(
    () =>
      draft.hospitalId && draft.serviceId
        ? selectHospitalServiceView(draft.hospitalId, draft.serviceId, state)
        : null,
    [draft.hospitalId, draft.serviceId, state],
  );
  const patient = selectPatient(draft.patientId, state);

  const breakdown = useMemo(
    () =>
      view
        ? recalculatePrice({
            service: view.service,
            hospitalService: view.hospitalService,
            price: view.price,
            components: view.components,
          })
        : null,
    [view],
  );

  if (!hospital || !view || !breakdown) {
    return (
      <EuShell>
        <EuEmptyState
          icon={FileText}
          title="Nothing to check out"
          description="Start by choosing a hospital and a service. Checkout needs a specific service at a specific hospital."
          action={
            <Link to="/e-upchar/hospitals" className="eu-btn eu-btn-primary px-4 py-2.5">
              Browse hospitals
            </Link>
          }
        />
      </EuShell>
    );
  }

  const requiresPrescription = view.hospitalService.requiresPrescription;
  const steps = requiresPrescription
    ? ["Patient", "Prescription", "Appointment", "Review & pay"]
    : ["Patient", "Appointment", "Review & pay"];
  const reviewStep = steps.length - 1;
  const appointmentStep = steps.length - 2;

  const statusCopy = breakdownStatusCopy(breakdown);
  const payable = breakdown.totalPayablePaise;
  const paymentsLive = integrationReadiness.payments === "live";

  async function finalisePayment(booking: Booking) {
    if (payable === null) {
      // Nothing verifiable to charge — the booking stays a request.
      issueInvoice(booking.id, null);
      setBookingStatus(
        booking.id,
        booking.scheduleSource === "not_connected" ? "pending_hospital_confirmation" : "requested",
      );
      return;
    }

    const order = await createPaymentOrder({
      bookingId: booking.id,
      amountPaise: payable,
      patientName: patient?.fullName ?? "Patient",
      serviceName: view!.service.name,
    });
    if (!order.ok) {
      // The booking survives; the payment simply did not start.
      issueInvoice(booking.id, null);
      setBookingStatus(booking.id, "pending_hospital_confirmation");
      setError(order.reason);
      return;
    }

    if (order.sandbox) {
      const verification = await verifyPayment({
        bookingId: booking.id,
        orderId: order.orderId,
        providerPaymentId: null,
        signature: null,
        sandbox: true,
      });
      const payment = attachPayment(booking.id, {
        providerPaymentId: null,
        orderId: order.orderId,
        amountPaise: payable,
        status: verification.status,
        sandbox: true,
      });
      issueInvoice(booking.id, payment.id);
      setBookingStatus(booking.id, "confirmed");
      return;
    }

    // Live path: the provider's checkout runs, then the server decides.
    const loaded = await loadRazorpayCheckout();
    const RazorpayCtor = (window as unknown as {
      Razorpay?: new (options: RazorpayOptions) => { open: () => void };
    }).Razorpay;
    if (!loaded || !RazorpayCtor || !order.publicKeyId) {
      issueInvoice(booking.id, null);
      setBookingStatus(booking.id, "pending_hospital_confirmation");
      setError("The payment window could not be opened. The booking was saved without payment.");
      return;
    }

    await new Promise<void>((resolve) => {
      const checkout = new RazorpayCtor({
        key: order.publicKeyId!,
        amount: payable,
        currency: "INR",
        name: "MEDIPAL E-UPCHAR",
        description: `${view!.service.name} · ${hospital!.name}`,
        order_id: order.orderId,
        theme: { color: "#E91E4D" },
        modal: { ondismiss: () => resolve() },
        handler: (response) => {
          void (async () => {
            const verification = await verifyPayment({
              bookingId: booking.id,
              orderId: order.orderId,
              providerPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              sandbox: false,
            });
            const payment = attachPayment(booking.id, {
              providerPaymentId: response.razorpay_payment_id,
              orderId: order.orderId,
              amountPaise: payable,
              status: verification.status,
              sandbox: false,
            });
            issueInvoice(booking.id, payment.id);
            if (verification.status === "paid") {
              setBookingStatus(booking.id, "confirmed");
            } else {
              setBookingStatus(booking.id, "pending_hospital_confirmation");
              setError(verification.reason);
            }
            resolve();
          })();
        },
      });
      checkout.open();
    });
  }

  async function handleConfirm() {
    if (!patient) {
      setError("Choose a patient before confirming the booking.");
      setStep(0);
      return;
    }
    if (requiresPrescription && !draft.prescriptionDocumentId) {
      setError("Upload a prescription to continue with this service.");
      setStep(1);
      return;
    }

    setBusy(true);
    setError(null);

    const scheduleSource: ScheduleSource = draft.appointmentStartsAt
      ? state.practiceMode
        ? "practice"
        : "admin_configured"
      : "not_connected";

    const result = createBooking({
      patientId: patient.id,
      hospitalId: hospital!.id,
      serviceId: view!.service.id,
      appointmentStartsAt: draft.appointmentStartsAt,
      appointmentEndsAt: draft.appointmentEndsAt,
      scheduleSource,
      prescriptionDocumentId: draft.prescriptionDocumentId,
      notes: draft.notes,
    });

    if (!result.ok) {
      setBusy(false);
      setError(result.reason);
      return;
    }

    await finalisePayment(result.booking);
    setBusy(false);
    resetDraft();
    navigate(`/e-upchar/confirmation/${result.booking.id}`);
  }

  return (
    <EuShell>
      <EuPageHeader
        eyebrow="E-UPCHAR · Checkout"
        title="Review and confirm"
        description={`${view.service.name} at ${hospital.name}, ${hospital.district}.`}
        breadcrumb={[
          { label: "E-UPCHAR", to: "/e-upchar" },
          { label: hospital.name, to: `/e-upchar/hospitals/${hospital.id}` },
          { label: view.service.name, to: `/e-upchar/services/${view.service.id}?hospital=${hospital.id}` },
          { label: "Checkout" },
        ]}
      />

      <EuStepper steps={steps} current={step} />

      {error && (
        <EuNotice tone="error" title="We could not finish that step" className="mb-5">
          {error}
        </EuNotice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {step === 0 && (
            <EuCard className="p-5">
              <EuSectionTitle
                title="Who is this for?"
                description="Patient details are stored against your account only. Identity is optional and always masked."
              />
              <div className="mt-4 space-y-3">
                {patient ? <PatientRow patient={patient} /> : null}
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className={cn(
                    "eu-btn w-full justify-center gap-2 px-4 py-2.5",
                    patient ? "eu-btn-secondary" : "eu-btn-primary",
                  )}
                >
                  <UserRound className="h-4 w-4" aria-hidden />
                  {patient ? "Change patient" : "Select Patient"}
                </button>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  disabled={!patient}
                  onClick={() => setStep(1)}
                  className={cn(
                    "eu-btn gap-2 px-4 py-2.5",
                    patient ? "eu-btn-primary" : "cursor-not-allowed border border-eu-border bg-eu-surface text-eu-muted/70",
                  )}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </EuCard>
          )}

          {requiresPrescription && step === 1 && (
            <EuCard className="p-5">
              <PrescriptionUpload
                patientId={draft.patientId}
                documentId={draft.prescriptionDocumentId}
                onChange={(documentId) => patchDraft({ prescriptionDocumentId: documentId })}
              />
              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="eu-btn eu-btn-primary gap-2 px-4 py-2.5"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </EuCard>
          )}

          {step === appointmentStep && (
            <EuCard className="p-5">
              <EuSectionTitle
                title="Choose an appointment"
                description="Only times this hospital has actually made available are shown."
              />
              <div className="mt-4">
                <SlotPicker
                  hospitalId={hospital.id}
                  serviceId={view.service.id}
                  selectedStartsAt={draft.appointmentStartsAt}
                  selectedEndsAt={draft.appointmentEndsAt}
                  onSelect={(slot) =>
                    patchDraft({
                      appointmentStartsAt: slot?.startsAt ?? null,
                      appointmentEndsAt: slot?.endsAt ?? null,
                    })
                  }
                />
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(reviewStep)}
                  className="eu-btn eu-btn-primary gap-2 px-4 py-2.5"
                >
                  Review price
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </EuCard>
          )}

          {step === reviewStep && (
            <EuCard className="p-5">
              <EuSectionTitle title="Review" description="Check the details, then confirm." />
              <dl className="mt-4 divide-y divide-eu-border">
                <ReviewRow label="Hospital" value={`${hospital.name}, ${hospital.district}`} />
                <ReviewRow label="Service" value={view.service.name} />
                <ReviewRow label="Patient" value={patient ? patient.fullName : "Not selected"} />
                <ReviewRow
                  label="Appointment"
                  value={
                    draft.appointmentStartsAt
                      ? new Date(draft.appointmentStartsAt).toLocaleString("en-IN")
                      : "Booking request — hospital to confirm a time"
                  }
                />
                <ReviewRow
                  label="Prescription"
                  value={draft.prescriptionDocumentId ? "Uploaded" : requiresPrescription ? "Required" : "Not required"}
                />
              </dl>

              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={busy}
                  className="eu-btn eu-btn-primary gap-2 px-5 py-3"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  )}
                  {payable !== null ? `Confirm and pay ${formatPaise(payable)}` : "Confirm booking request"}
                </button>
              </div>
            </EuCard>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <EuCard className="p-5">
            <h2 className="text-[0.95rem] font-semibold text-eu-text">Price breakdown</h2>
            <p className="mt-1 text-[0.75rem] text-eu-muted">
              Recalculated by MEDIPAL from configured records — never taken from the browser.
            </p>

            <ul className="mt-4 space-y-3">
              {breakdown.lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-3 text-[0.85rem]">
                  <span className="min-w-0 text-eu-text">
                    {line.label}
                    <span className="block text-[0.72rem] text-eu-muted">Qty {line.quantity}</span>
                  </span>
                  <span className="shrink-0 text-eu-text">
                    {formatPaise(line.unitPricePaise) ?? E_UPCHAR_COPY.priceUnavailable}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 border-t border-eu-border pt-3 text-[0.85rem] text-eu-muted">
                <span>Taxes &amp; fees</span>
                <span>{formatPaise(breakdown.taxesAndFeesPaise) ?? "—"}</span>
              </li>
            </ul>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-eu-border pt-4">
              <span className="text-sm font-semibold text-eu-text">Total payable</span>
              <EuPrice paise={payable} status={breakdown.status} />
            </div>

            <EuNotice
              className="mt-4"
              tone={statusCopy.tone === "ok" ? "info" : statusCopy.tone === "warn" ? "warn" : "info"}
              title={statusCopy.label}
            >
              {statusCopy.detail}
            </EuNotice>

            {!paymentsLive && payable !== null && (
              <EuNotice tone="practice" title="Sandbox checkout" className="mt-3">
                Live payments are not configured. Continuing records a clearly-labelled sandbox result
                — no money moves and no card is charged.
              </EuNotice>
            )}
          </EuCard>

          <EuNotice tone="info" title="No slot is held yet">
            {draft.appointmentStartsAt
              ? `A slot is held for ${bookingPolicy.slotHoldMinutes} minutes while you finish checkout.`
              : "Without a connected hospital diary, this booking is a request the hospital confirms with you directly."}
          </EuNotice>

          <EuCard className="p-5">
            <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold text-eu-text">
              {paymentsLive ? (
                <Lock className="h-4 w-4 text-eu-ok" aria-hidden />
              ) : (
                <ShieldCheck className="h-4 w-4 text-eu-ok" aria-hidden />
              )}
              How payment is handled
            </h2>
            <ul className="mt-3 space-y-2 text-[0.8rem] leading-relaxed text-eu-muted">
              <li>· The amount is recalculated server-side; a client-supplied total is never trusted.</li>
              <li>· Payment status is confirmed by the payment service, not by the browser.</li>
              <li>· Your receipt is a MEDIPAL receipt, never a hospital tax invoice.</li>
              {!draft.appointmentStartsAt && <li>· No appointment exists until the hospital confirms one.</li>}
            </ul>
          </EuCard>
        </aside>
      </div>

      <PatientPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentPatientId={draft.patientId}
        onSelect={(selected) => {
          patchDraft({ patientId: selected.id });
          setPickerOpen(false);
        }}
      />
    </EuShell>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-[0.85rem]">
      <dt className="text-eu-muted">{label}</dt>
      <dd className="font-medium text-eu-text">{value}</dd>
    </div>
  );
}
