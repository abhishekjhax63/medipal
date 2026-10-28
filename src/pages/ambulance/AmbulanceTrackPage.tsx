/**
 * Ambulance — tracking and history.
 *
 * The server returns a booking only when BOTH the reference and the contact
 * number match, so this page cannot be used to read somebody else's request.
 * The local history list only ever holds requests made on this device.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  History,
  LoaderCircle,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { AmbulanceEmergencyPanel } from "@/components/ambulance/AmbulanceEmergencyPanel";
import { EuBadge, EuEmptyState, EuNotice, EuSectionTitle } from "@/components/eupchar/ui";
import { cn } from "@/lib/cn";
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_TONE,
  REQUEST_ONLY_NOTE,
  clearAmbulanceHistory,
  forgetAmbulanceBooking,
  formatRelativeTime,
  readAmbulanceHistory,
  type StoredAmbulanceBooking,
} from "@/lib/ambulance/presentation";
import { formatDateTime } from "@/lib/eupchar/format";
import { ambulanceApi, AmbulanceApiError } from "@/services/ambulance/api";
import type { AmbulanceBookingStatus, TrackedBooking } from "@/services/ambulance/types";

const MOBILE_RE = /^[6-9]\d{9}$/;
const CANCELLABLE: AmbulanceBookingStatus[] = ["requested", "accepted", "assigned"];

export default function AmbulanceTrackPage() {
  const [params] = useSearchParams();
  const [reference, setReference] = useState(params.get("reference") ?? "");
  const [phone, setPhone] = useState(params.get("phone") ?? "");
  const [tracked, setTracked] = useState<TrackedBooking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StoredAmbulanceBooking[]>([]);

  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(readAmbulanceHistory());
  }, []);

  const lookup = useCallback(
    async (ref: string, contact: string) => {
      if (!ref.trim() || !MOBILE_RE.test(contact.trim())) {
        setError("Enter the booking reference and the 10-digit mobile number used to book.");
        return;
      }
      setLoading(true);
      setError(null);
      setCancelError(null);
      try {
        const response = await ambulanceApi.trackBooking(ref.trim(), contact.trim());
        setTracked(response);
      } catch (caught) {
        setTracked(null);
        setError(
          caught instanceof AmbulanceApiError
            ? caught.message
            : "MEDIPAL could not load that booking. Check your connection and try again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Auto-load when both values arrive in the URL (the booking confirmation links here).
  const initialRef = params.get("reference");
  const initialPhone = params.get("phone");
  useEffect(() => {
    if (initialRef && initialPhone) void lookup(initialRef, initialPhone);
    // Run once for the values present at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancelBooking() {
    if (!tracked) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const response = await ambulanceApi.cancelBooking(tracked.booking.reference, {
        phone: tracked.booking.contactPhone,
        reason: "Cancelled by the requester from the tracking page.",
      });
      setTracked({ ...tracked, booking: response.booking, events: response.events });
    } catch (caught) {
      setCancelError(
        caught instanceof AmbulanceApiError
          ? caught.message
          : "The booking could not be cancelled. Please try again.",
      );
    } finally {
      setCancelBusy(false);
    }
  }

  const cancellable = useMemo(
    () => Boolean(tracked && CANCELLABLE.includes(tracked.booking.status)),
    [tracked],
  );

  return (
    <main className="section-shell pt-12 pb-20 sm:pt-14">
      <div className="mb-6">
        <Link
          to="/ambulance"
          className="inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-content-secondary transition-colors hover:text-crimson-soft"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Ambulance
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-content-primary">
          Track an ambulance request
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-content-secondary">
          Enter the reference MEDIPAL gave you and the mobile number the request was made with.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="space-y-6">
          {/* Lookup form */}
          <form
            className="glass-panel rounded-4xl p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void lookup(reference, phone);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="eu-label">Booking reference</span>
                <input
                  className="field"
                  value={reference}
                  onChange={(event) => setReference(event.target.value.toUpperCase())}
                  placeholder="e.g. AMP-XXXXXXXX"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="eu-label">Contact number</span>
                <input
                  className="field"
                  inputMode="numeric"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                  placeholder="10-digit mobile"
                  autoComplete="tel"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={loading} className="btn-primary px-5 py-2.5 text-sm">
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
                {loading ? "Looking…" : "Track request"}
              </button>
              <span className="text-[0.74rem] text-content-secondary">
                Both values must match — MEDIPAL cannot look a request up with one alone.
              </span>
            </div>
          </form>

          {error && (
            <EuNotice tone="error" title="That lookup did not succeed">
              {error}
            </EuNotice>
          )}

          {/* Result */}
          {tracked && (
            <section className="glass-panel glass-hairline rounded-4xl p-5 sm:p-6" aria-live="polite">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-content-secondary">
                    Reference
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-content-primary">
                    {tracked.booking.reference}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.1em]",
                      BOOKING_STATUS_TONE[tracked.booking.status],
                    )}
                  >
                    {BOOKING_STATUS_LABEL[tracked.booking.status]}
                  </span>
                  <button
                    type="button"
                    onClick={() => void lookup(tracked.booking.reference, tracked.booking.contactPhone)}
                    className="inline-flex items-center gap-1.5 text-[0.76rem] font-medium text-crimson-soft"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Refresh
                  </button>
                </div>
              </div>

              <EuNotice tone="warn" className="mt-4">
                {REQUEST_ONLY_NOTE}
              </EuNotice>

              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <Detail label="Category" value={tracked.booking.category} />
                <Detail
                  label="Urgency"
                  value={tracked.booking.urgency === "emergency" ? "Emergency" : "Planned transport"}
                />
                <Detail label="Pickup" value={tracked.booking.pickup.address} />
                <Detail
                  label="Destination"
                  value={tracked.booking.destination.name ?? "Not specified"}
                />
                <Detail
                  label="Operator"
                  value={tracked.booking.providerName ?? "No operator selected"}
                />
                <Detail label="Requested" value={formatDateTime(tracked.booking.createdAt)} />
              </dl>

              {tracked.booking.providerPhone && (
                <a
                  href={`tel:${tracked.booking.providerPhone}`}
                  className="btn-secondary mt-4 inline-flex px-4 py-2 text-[0.8rem]"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  Call {tracked.booking.providerName ?? "operator"} — {tracked.booking.providerPhone}
                </a>
              )}

              <div className="mt-4 rounded-2xl border border-line bg-white/70 p-3.5 text-[0.76rem] leading-relaxed text-content-secondary">
                {tracked.liveTrackingAvailable ? (
                  <>
                    This operator runs a dispatch feed, so a status change can appear here as soon as
                    they record it. MEDIPAL still does not draw a moving vehicle position unless the
                    operator publishes one.
                  </>
                ) : (
                  <>
                    This operator uses the telephone, not a dispatch feed. There is no live vehicle
                    position to show, and MEDIPAL will not draw one.
                  </>
                )}
              </div>

              {/* Timeline */}
              <h2 className="mt-6 flex items-center gap-2 text-sm font-semibold text-content-primary">
                <Clock className="h-4 w-4 text-crimson-bright" aria-hidden />
                Status history
              </h2>
              <ol className="mt-3 space-y-3">
                {tracked.events.map((event, index) => (
                  <li key={`${event.status}-${index}`} className="flex gap-3">
                    <span className="mt-1 flex flex-col items-center">
                      <span className="h-2.5 w-2.5 rounded-full bg-crimson" />
                      {index < tracked.events.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-line" />}
                    </span>
                    <div className="pb-1">
                      <p className="text-sm font-medium text-content-primary">
                        {BOOKING_STATUS_LABEL[event.status]}
                      </p>
                      {event.note && (
                        <p className="mt-0.5 text-[0.78rem] leading-relaxed text-content-secondary">
                          {event.note}
                        </p>
                      )}
                      <p className="mt-0.5 text-[0.72rem] text-content-secondary/80">
                        {formatDateTime(event.createdAt)} ·{" "}
                        {event.source.replace(/_/g, " ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              {cancelError && (
                <EuNotice tone="error" className="mt-4">
                  {cancelError}
                </EuNotice>
              )}

              {cancellable ? (
                <button
                  type="button"
                  onClick={() => void cancelBooking()}
                  disabled={cancelBusy}
                  className="btn-secondary mt-5 inline-flex border-danger/40 px-4 py-2 text-[0.8rem] text-danger"
                >
                  {cancelBusy ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Cancel this request
                </button>
              ) : (
                <p className="mt-5 flex items-start gap-2 text-[0.76rem] leading-relaxed text-content-secondary">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                  This request can no longer be cancelled from MEDIPAL. Telephone the operator
                  directly.
                </p>
              )}
            </section>
          )}

          {!tracked && !error && !loading && (
            <EuEmptyState
              icon={Search}
              title="Enter your reference to begin"
              description="Your requests are listed on the right. MEDIPAL keeps them only on this device."
            />
          )}
        </div>

        {/* Sidebar: history + emergency */}
        <aside className="space-y-6">
          <section className="glass-panel rounded-4xl p-5">
            <EuSectionTitle
              title="Your requests"
              description="Stored on this device only."
              action={
                history.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearAmbulanceHistory();
                      setHistory([]);
                    }}
                    className="inline-flex items-center gap-1.5 text-[0.76rem] font-medium text-content-secondary hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Clear
                  </button>
                ) : undefined
              }
            />
            <div className="mt-4">
              {history.length === 0 ? (
                <p className="flex items-start gap-2 rounded-2xl border border-dashed border-line bg-white/60 p-4 text-[0.78rem] leading-relaxed text-content-secondary">
                  <History className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Nothing stored yet. Requests you record on this device will appear here.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {history.map((entry) => (
                    <li key={entry.reference} className="rounded-2xl border border-line bg-white/70 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReference(entry.reference);
                            setPhone(entry.phone);
                            void lookup(entry.reference, entry.phone);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block font-mono text-sm font-semibold text-content-primary">
                            {entry.reference}
                          </span>
                          <span className="mt-0.5 block text-[0.74rem] text-content-secondary">
                            {entry.category} · {formatRelativeTime(entry.createdAt) ?? "recently"}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${entry.reference} from this device`}
                          onClick={() => {
                            forgetAmbulanceBooking(entry.reference);
                            setHistory(readAmbulanceHistory());
                          }}
                          className="rounded-full p-1.5 text-content-secondary transition-colors hover:bg-blush/70 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-4 text-[0.72rem] leading-relaxed text-content-secondary/90">
              <EuBadge tone="neutral">Privacy</EuBadge>{" "}
              <span className="ml-1">
                This list holds only the reference, the number you typed and a little context. It is
                never sent anywhere except to MEDIPAL's own booking lookup, and you can erase it at
                any time.
              </span>
            </p>
          </section>

          <AmbulanceEmergencyPanel />
        </aside>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white/70 p-3.5">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-content-secondary">
        {label}
      </dt>
      <dd className="mt-1 text-[0.84rem] leading-relaxed text-content-primary">{value}</dd>
    </div>
  );
}
