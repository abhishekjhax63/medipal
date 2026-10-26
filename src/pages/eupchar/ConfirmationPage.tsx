import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Compass,
  FileText,
  Hourglass,
  MapPin,
  Stethoscope,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice } from "@/components/eupchar/ui";
import { services } from "@/data/eupchar/serviceCatalog";
import {
  selectBooking,
  selectHospital,
  selectPatient,
  selectPayment,
} from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { formatDate, formatPaise, formatTime } from "@/lib/eupchar/format";
import { E_UPCHAR_COPY } from "@/types/eupchar";

export default function ConfirmationPage() {
  const { bookingId = "" } = useParams();
  const state = useEuState();
  const booking = selectBooking(bookingId, state);

  if (!booking) {
    return (
      <EuShell>
        <EuEmptyState
          icon={FileText}
          title="Booking not found"
          description="This booking is not in your account. Open My Appointments to see the bookings MEDIPAL holds for you."
          action={
            <Link to="/e-upchar/appointments" className="eu-btn eu-btn-primary px-4 py-2.5">
              My Appointments
            </Link>
          }
        />
      </EuShell>
    );
  }

  const hospital = selectHospital(booking.hospitalId, state);
  const patient = selectPatient(booking.patientId, state);
  const payment = selectPayment(booking.paymentId, state);
  const service = services.find((entry) => entry.id === booking.serviceId) ?? null;

  const isConfirmed = booking.status === "confirmed";
  const isPaid = payment?.status === "paid";
  const sandbox = payment?.sandbox ?? false;

  return (
    <EuShell>
      <div className="mx-auto max-w-3xl">
        <EuCard className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full border ${
                isConfirmed ? "border-[#bfe3ce] bg-[#eefaf2] text-eu-ok" : "border-[#f0dcb4] bg-[#fdf6e6] text-eu-warn"
              }`}
            >
              {isConfirmed ? (
                <CheckCircle2 className="h-7 w-7" aria-hidden />
              ) : (
                <Hourglass className="h-7 w-7" aria-hidden />
              )}
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-eu-text">
              {isConfirmed ? E_UPCHAR_COPY.confirmationHeading : "Your Booking Request Was Received"}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-eu-muted">
              {isConfirmed
                ? "MEDIPAL has recorded this booking. Show the booking reference at the hospital's front desk."
                : "MEDIPAL has recorded your request. This hospital's appointment diary is not connected, so the hospital will confirm a time with you directly."}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <EuBadge tone="red">Reference {booking.reference}</EuBadge>
              {payment && (
                <EuBadge tone={isPaid ? "ok" : "warn"}>
                  {isPaid ? "Payment recorded" : `Payment ${payment.status.replace("_", " ")}`}
                </EuBadge>
              )}
              {sandbox && <EuBadge tone="practice">Sandbox</EuBadge>}
            </div>
          </div>

          <dl className="mt-7 divide-y divide-eu-border border-y border-eu-border">
            <Row icon={Stethoscope} label="Service" value={service?.name ?? booking.serviceId} />
            <Row
              icon={MapPin}
              label="Hospital"
              value={hospital ? `${hospital.name}, ${hospital.district}` : booking.hospitalId}
            />
            <Row label="Patient" value={patient ? patient.fullName : "—"} />
            <Row
              icon={CalendarClock}
              label="Appointment"
              value={
                booking.appointmentStartsAt
                  ? `${formatDate(booking.appointmentStartsAt)} · ${formatTime(booking.appointmentStartsAt)}`
                  : "To be confirmed by the hospital"
              }
            />
            <Row
              label="Amount"
              value={
                booking.totalPayablePaise !== null
                  ? formatPaise(booking.totalPayablePaise) ?? "—"
                  : E_UPCHAR_COPY.priceUnavailable
              }
            />
            <Row label="Booking status" value={booking.status.replace(/_/g, " ")} />
          </dl>

          {sandbox && (
            <EuNotice tone="practice" className="mt-5">
              This booking ran in sandbox: no money was processed and no real appointment exists until
              a hospital confirms it. It is a walkthrough, not a hospital booking.
            </EuNotice>
          )}

          {!isPaid && booking.totalPayablePaise === null && (
            <EuNotice tone="info" className="mt-5" title="No payment was taken">
              There is no verified price for this service at this hospital, so E-UPCHAR deliberately
              did not start a payment. The hospital will tell you the amount.
            </EuNotice>
          )}

          <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
            <Link
              to={`/e-upchar/receipt/${booking.id}`}
              className="eu-btn eu-btn-primary justify-center gap-2 px-4 py-3"
            >
              <FileText className="h-4 w-4" aria-hidden />
              View receipt
            </Link>
            <Link
              to="/e-upchar/appointments"
              className="eu-btn eu-btn-secondary justify-center gap-2 px-4 py-3"
            >
              View booking details
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to={`/e-upchar/directions/${booking.hospitalId}`}
              className="eu-btn eu-btn-secondary justify-center gap-2 px-4 py-3"
            >
              <Compass className="h-4 w-4" aria-hidden />
              Hospital location
            </Link>
            <Link to="/e-upchar" className="eu-btn eu-btn-quiet justify-center gap-2 px-4 py-3">
              Book something else
            </Link>
          </div>
        </EuCard>

        <p className="mt-5 text-center text-[0.75rem] leading-relaxed text-eu-muted">
          This confirmation is issued by MEDIPAL. It is not a hospital admission, a treatment
          guarantee, or a hospital tax invoice.
        </p>
      </div>
    </EuShell>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3.5">
      <dt className="flex items-center gap-2 text-[0.82rem] text-eu-muted">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
        {label}
      </dt>
      <dd className="text-[0.85rem] font-medium capitalize text-eu-text">{value}</dd>
    </div>
  );
}
