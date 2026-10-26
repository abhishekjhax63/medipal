import { useMemo, useState } from "react";
import { CalendarCheck, Compass, FileText, Hourglass, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice } from "@/components/eupchar/ui";
import { services } from "@/data/eupchar/serviceCatalog";
import { selectBookings, selectHospital, selectPatient, setBookingStatus } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { formatDate, formatPaise, formatTime } from "@/lib/eupchar/format";
import type { Booking, BookingStatus } from "@/types/eupchar";

type FilterId = "all" | "upcoming" | "pending" | "completed" | "cancelled";

const FILTERS: readonly { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

function isUpcoming(booking: Booking): boolean {
  if (booking.status !== "confirmed") return false;
  if (!booking.appointmentStartsAt) return false;
  return new Date(booking.appointmentStartsAt).getTime() >= Date.now() - 6 * 60 * 60 * 1000;
}

function matchesFilter(booking: Booking, filter: FilterId): boolean {
  switch (filter) {
    case "upcoming":
      return isUpcoming(booking);
    case "pending":
      return booking.status === "requested" || booking.status === "pending_hospital_confirmation";
    case "completed":
      return booking.status === "completed";
    case "cancelled":
      return booking.status === "cancelled";
    default:
      return true;
  }
}

const STATUS_TONE: Record<BookingStatus, "ok" | "warn" | "neutral" | "red"> = {
  confirmed: "ok",
  requested: "warn",
  pending_hospital_confirmation: "warn",
  completed: "neutral",
  cancelled: "red",
};

export default function AppointmentsPage() {
  const state = useEuState();
  const bookings = selectBookings(state);
  const [filter, setFilter] = useState<FilterId>("all");
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const visible = useMemo(
    () => bookings.filter((booking) => matchesFilter(booking, filter)),
    [bookings, filter],
  );

  return (
    <EuShell>
      <EuPageHeader
        eyebrow="E-UPCHAR"
        title="My Appointments"
        description="Every booking MEDIPAL holds for you, with its receipt and the hospital's location."
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
            className={cn(
              "eu-chip",
              filter === option.id
                ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep"
                : "border-eu-border bg-eu-bg text-eu-muted",
            )}
          >
            {option.label}
            {option.id === "all" ? ` (${bookings.length})` : ""}
          </button>
        ))}
      </div>

      {bookings.length === 0 ? (
        <EuEmptyState
          className="mt-6"
          icon={CalendarCheck}
          title="No appointments yet"
          description="Once you book a service, it appears here with its receipt and status."
          action={
            <Link to="/e-upchar/hospitals" className="eu-btn eu-btn-primary px-4 py-2.5">
              Find a hospital
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EuEmptyState
          className="mt-6"
          icon={Hourglass}
          title={`Nothing in “${FILTERS.find((f) => f.id === filter)?.label}”`}
          description="Try another filter to see your other bookings."
        />
      ) : (
        <ul className="mt-6 space-y-4">
          {visible.map((booking) => {
            const hospital = selectHospital(booking.hospitalId, state);
            const patient = selectPatient(booking.patientId, state);
            const service = services.find((entry) => entry.id === booking.serviceId) ?? null;
            const canCancel = booking.status !== "cancelled" && booking.status !== "completed";
            return (
              <EuCard as="li" key={booking.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <EuBadge tone={STATUS_TONE[booking.status]}>
                        {booking.status.replace(/_/g, " ")}
                      </EuBadge>
                      <span className="font-mono text-[0.72rem] text-eu-muted">{booking.reference}</span>
                    </div>
                    <h2 className="mt-2 text-[1rem] font-semibold text-eu-text">
                      {service?.name ?? booking.serviceId}
                    </h2>
                    <p className="mt-0.5 text-[0.82rem] text-eu-muted">
                      {hospital ? `${hospital.name}, ${hospital.district}` : booking.hospitalId}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.75rem] text-eu-muted">Amount</p>
                    <p className="text-[0.9rem] font-semibold text-eu-text">
                      {formatPaise(booking.totalPayablePaise) ?? "Not verified"}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 border-t border-eu-border pt-4 text-[0.8rem] sm:grid-cols-3">
                  <div>
                    <dt className="text-eu-muted">Patient</dt>
                    <dd className="text-eu-text">{patient?.fullName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-eu-muted">Appointment</dt>
                    <dd className="text-eu-text">
                      {booking.appointmentStartsAt
                        ? `${formatDate(booking.appointmentStartsAt)} · ${formatTime(booking.appointmentStartsAt)}`
                        : "Hospital to confirm"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-eu-muted">Booked on</dt>
                    <dd className="text-eu-text">{formatDate(booking.createdAt)}</dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Link
                    to={`/e-upchar/receipt/${booking.id}`}
                    className="eu-btn eu-btn-secondary gap-1.5 px-3 py-2 text-[0.78rem]"
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    {booking.invoiceId ? "View receipt" : "View booking"}
                  </Link>
                  <Link
                    to={`/e-upchar/directions/${booking.hospitalId}`}
                    className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]"
                  >
                    <Compass className="h-3.5 w-3.5" aria-hidden />
                    Directions
                  </Link>
                  {canCancel &&
                    (confirmCancel === booking.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setBookingStatus(booking.id, "cancelled");
                            setConfirmCancel(null);
                          }}
                          className="eu-btn eu-btn-quiet px-2.5 py-2 text-[0.78rem] text-eu-red-deep"
                        >
                          Confirm cancellation
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancel(null)}
                          className="eu-btn eu-btn-quiet px-2.5 py-2 text-[0.78rem]"
                        >
                          Keep booking
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(booking.id)}
                        className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem] text-eu-muted"
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden />
                        Cancel
                      </button>
                    ))}
                </div>
              </EuCard>
            );
          })}
        </ul>
      )}

      <EuNotice tone="info" className="mt-6">
        Cancelling here records your request with MEDIPAL. If a payment was taken, refunds are handled
        by the hospital and the payment provider — MEDIPAL does not silently move money.
      </EuNotice>
    </EuShell>
  );
}
