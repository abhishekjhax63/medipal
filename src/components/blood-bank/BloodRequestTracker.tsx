import { useState, type FormEvent } from "react";
import {
  CircleAlert,
  ClipboardList,
  LoaderCircle,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/cn";
import {
  REQUEST_STATUS_EXPLANATION,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  absoluteTime,
  relativeTime,
} from "@/lib/blood/presentation";
import { BloodApiError, bloodApi } from "@/services/blood/api";
import type { TrackedRequest } from "@/services/blood/types";

type TrackState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; request: TrackedRequest }
  | { kind: "error"; message: string; code: string };

function StatusBadge({ status }: { status: TrackedRequest["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em]",
        REQUEST_STATUS_TONE[status],
      )}
    >
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Request tracker.
 *
 * Shows only what MEDIPAL has actually recorded for the request: the events in
 * `blood_request_events`, in the order they happened. A request with one event
 * is displayed as exactly that — one event — because a short timeline means
 * nothing has happened yet, not that help is on the way.
 */
export function BloodRequestTracker() {
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ reference?: string; phone?: string }>({});
  const [state, setState] = useState<TrackState>({ kind: "idle" });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ref = reference.trim();
    const digits = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    const errors: { reference?: string; phone?: string } = {};
    if (!ref) errors.reference = "Enter the reference MEDIPAL gave you when the request was recorded.";
    else if (ref.length < 4) errors.reference = "That reference looks too short.";
    if (!phone.trim()) errors.phone = "Enter the mobile number submitted with the request.";
    else if (!/^[6-9]\d{9}$/.test(digits)) errors.phone = "Enter a valid 10-digit Indian mobile number.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setState({ kind: "loading" });
    void (async () => {
      try {
        const request = await bloodApi.trackRequest(ref, digits);
        setState({ kind: "ready", request });
      } catch (error) {
        if (error instanceof BloodApiError) {
          setState({ kind: "error", message: error.message, code: error.code });
          return;
        }
        setState({
          kind: "error",
          message: "MEDIPAL could not look up that request. Check your connection and try again.",
          code: "UNKNOWN",
        });
      }
    })();
  };

  const reset = () => {
    setReference("");
    setPhone("");
    setFieldErrors({});
    setState({ kind: "idle" });
  };

  return (
    <section id="track-request" className="section-shell section-pad scroll-mt-28">
      <SectionHeading
        eyebrow="Track a request"
        title="Follow a request you have already submitted"
        description="Enter the reference MEDIPAL gave you together with the mobile number you used. The page shows the recorded steps only — nothing is predicted, and no step is shown before it happens."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-[0.8fr_1fr] lg:gap-8">
        <GlassCard hairline interactive={false} className="p-7 sm:p-9">
          <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
            <div>
              <label className="field-label" htmlFor="track-reference">
                Request reference
              </label>
              <input
                id="track-reference"
                type="text"
                className="field font-mono uppercase"
                placeholder="e.g. MED-BBR-26-00001"
                value={reference}
                onChange={(event) => setReference(event.target.value.toUpperCase())}
                aria-invalid={Boolean(fieldErrors.reference)}
                aria-describedby={fieldErrors.reference ? "track-reference-error" : undefined}
              />
              {fieldErrors.reference ? (
                <p id="track-reference-error" className="field-error">
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {fieldErrors.reference}
                </p>
              ) : null}
            </div>

            <div>
              <label className="field-label" htmlFor="track-phone">
                Mobile number used
              </label>
              <input
                id="track-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="field"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? "track-phone-error" : undefined}
              />
              {fieldErrors.phone ? (
                <p id="track-phone-error" className="field-error">
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {fieldErrors.phone}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-primary" disabled={state.kind === "loading"}>
                {state.kind === "loading" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="h-4 w-4" aria-hidden />
                )}
                {state.kind === "loading" ? "Looking up…" : "Track request"}
              </button>
              <button type="button" className="btn-secondary" onClick={reset}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Clear
              </button>
            </div>

            <p className="flex items-start gap-2.5 rounded-2xl border border-line bg-blush-soft px-4 py-3 text-xs leading-relaxed text-content-secondary">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
              For privacy, MEDIPAL returns the same message whether the reference is unknown or the
              number does not match. Only the exact pair reveals a request.
            </p>
          </form>
        </GlassCard>

        <GlassCard interactive={false} className="p-7 sm:p-9">
          <div aria-live="polite">
            {state.kind === "idle" ? (
              <div className="flex h-full flex-col justify-center gap-4">
                <p className="flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-content-secondary">
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                  Waiting for a reference
                </p>
                <p className="text-sm leading-relaxed text-content-secondary">
                  Your reference and mobile number are both required. MEDIPAL will show the recorded
                  steps, the facility involved if one has accepted, and the timestamps for each step.
                </p>
              </div>
            ) : null}

            {state.kind === "loading" ? (
              <div className="flex items-center gap-3 text-sm text-content-secondary">
                <LoaderCircle className="h-4 w-4 animate-spin text-crimson-bright" aria-hidden />
                Reading the recorded events for this request…
              </div>
            ) : null}

            {state.kind === "error" ? (
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-crimson-bright" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-content-primary">That lookup did not succeed</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-content-secondary">{state.message}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-content-secondary/70">
                    Code {state.code}
                  </p>
                </div>
              </div>
            ) : null}

            {state.kind === "ready" ? <TrackedRequestView request={state.request} /> : null}
          </div>
        </GlassCard>
      </div>
    </section>
  );
}

function TrackedRequestView({ request }: { request: TrackedRequest }) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-semibold tracking-wide text-content-primary">
            {request.reference}
          </p>
          <p className="mt-1 text-xs text-content-secondary">
            Recorded {relativeTime(request.createdAt)} — {absoluteTime(request.createdAt)}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <p className="rounded-2xl border border-line bg-white/70 px-4 py-3.5 text-sm leading-relaxed text-content-secondary">
        {REQUEST_STATUS_EXPLANATION[request.status]}
      </p>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Detail label="Blood group" value={request.bloodGroup} />
        <Detail label="Component" value={request.component} />
        <Detail label="Units required" value={String(request.unitsRequired)} />
        <Detail label="Priority" value={request.priority} />
        <Detail
          label="Location"
          value={[request.location.city, request.location.district, request.location.state]
            .filter(Boolean)
            .join(", ")}
        />
        <Detail label="Hospital" value={request.hospitalName ?? "Not named"} />
        <Detail label="Required by" value={request.requiredBy ? absoluteTime(request.requiredBy) : "Not specified"} />
        <Detail label="Contact on file" value={request.contactOnFile} />
      </dl>

      {request.hospitalName ? (
        <p className="text-xs leading-relaxed text-content-secondary/85">
          {request.hospitalVerified
            ? "This hospital matched an approved MEDIPAL facility record."
            : "MEDIPAL has not verified this hospital against an approved facility record."}
        </p>
      ) : null}

      <div>
        <h4 className="font-display text-base font-semibold tracking-[-0.01em] text-content-primary">
          Recorded steps
        </h4>
        {request.timeline.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-content-secondary">
            No events are recorded against this request.
          </p>
        ) : (
          <ol className="mt-4 grid gap-3">
            {request.timeline.map((event, index) => (
              <li
                key={`${event.to}-${event.at}-${index}`}
                className="flex items-start gap-3 rounded-2xl border border-line bg-white/70 p-4"
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-crimson"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-content-primary">
                    {REQUEST_STATUS_LABEL[event.to]}
                    {event.from ? (
                      <span className="font-normal text-content-secondary">
                        {" "}
                        — from {REQUEST_STATUS_LABEL[event.from]}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-content-secondary">
                    {relativeTime(event.at)} — {absoluteTime(event.at)} · by {event.actor}
                  </p>
                  {event.note ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-content-secondary">{event.note}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {request.supplyingFacility ? (
        <div className="rounded-2xl border border-ok/30 bg-ok/10 px-4 py-3.5">
          <p className="text-sm font-medium text-content-primary">
            Supplying facility: {request.supplyingFacility.name}
          </p>
          {request.supplyingFacility.phone ? (
            <a
              href={`tel:${request.supplyingFacility.phone}`}
              className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-crimson-soft hover:underline"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {request.supplyingFacility.phone}
            </a>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-content-secondary/80">{request.note}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-content-secondary/70">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-content-primary">{value}</dd>
    </div>
  );
}
