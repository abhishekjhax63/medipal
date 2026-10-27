/**
 * Ambulance booking workflow.
 *
 * Follows the required sequence — requirement → location → destination →
 * available operators → call or book — and then hands the patient a status view.
 *
 * Three rules this component never breaks:
 *  1. Geolocation is only used after the browser actually grants it. A denial,
 *     unavailable fix or timeout always falls back to a typed address, and the
 *     chosen `pickupSource` records which of the two really happened.
 *  2. Nothing is drawn as "dispatched". The most a submission can produce is a
 *     recorded request, and the copy says exactly that.
 *  3. Nothing is invented. If a fare or an operator is missing, the screen says
 *     so rather than filling the gap.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Hospital,
  LocateFixed,
  MapPin,
  Phone,
  Search,
  Send,
  ShieldAlert,
  Stethoscope,
  User,
} from "lucide-react";
import { EuNotice, EuStepper } from "@/components/eupchar/ui";
import { ProviderCard } from "@/components/ambulance/ProviderCard";
import { cn } from "@/lib/cn";
import { EASE_SMOOTH } from "@/lib/animations";
import { CATEGORY_META, NEED_LABEL, rememberAmbulanceBooking } from "@/lib/ambulance/presentation";
import { ambulanceApi, AmbulanceApiError } from "@/services/ambulance/api";
import { geoApi, staticMapUrl } from "@/services/geo";
import {
  AMBULANCE_CATEGORIES,
  AMBULANCE_NEEDS,
  type AmbulanceBooking,
  type AmbulanceCategory,
  type AmbulanceNeed,
  type AmbulanceProvider,
  type AmbulanceUrgency,
  type BookingInput,
  type PickupSource,
} from "@/services/ambulance/types";
import { verifiedHospitals } from "@/data/eupchar/biharHospitals";

const STEPS = [
  "Requirement",
  "Your location",
  "Destination",
  "Operators",
  "Patient & confirm",
] as const;

const MOBILE_RE = /^[6-9]\d{9}$/;

type GeoState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | {
      kind: "granted";
      latitude: number;
      longitude: number;
      accuracy: number | null;
      address: string | null;
      resolvingAddress: boolean;
      addressError: string | null;
      mapUnavailable: boolean;
    }
  | { kind: "denied"; message: string }
  | { kind: "unavailable"; message: string };

interface WizardData {
  category: AmbulanceCategory | null;
  urgency: AmbulanceUrgency | null;
  needs: AmbulanceNeed[];
  pickupAddress: string;
  pickupLandmark: string;
  pickupSource: PickupSource;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  pickupAccuracyMeters: number | null;
  destinationName: string;
  destinationAddress: string;
  destinationPhone: string;
  providerId: string | null;
  providerName: string | null;
  patientName: string;
  contactPhone: string;
  patientAge: string;
  patientSex: "" | "female" | "male" | "other" | "undisclosed";
  notes: string;
  consentToShare: boolean;
}

const EMPTY: WizardData = {
  category: null,
  urgency: null,
  needs: [],
  pickupAddress: "",
  pickupLandmark: "",
  pickupSource: "manual",
  pickupLatitude: null,
  pickupLongitude: null,
  pickupAccuracyMeters: null,
  destinationName: "",
  destinationAddress: "",
  destinationPhone: "",
  providerId: null,
  providerName: null,
  patientName: "",
  contactPhone: "",
  patientAge: "",
  patientSex: "",
  notes: "",
  consentToShare: false,
};

export function AmbulanceBookingWizard({
  initialCategory = null,
  onBooked,
}: {
  initialCategory?: AmbulanceCategory | null;
  onBooked?: (booking: AmbulanceBooking) => void;
}) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(() => ({ ...EMPTY, category: initialCategory }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });

  const [providers, setProviders] = useState<AmbulanceProvider[] | null>(null);
  const [providersNote, setProvidersNote] = useState<string>("");
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);

  const [hospitalQuery, setHospitalQuery] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ booking: AmbulanceBooking; acceptanceNote: string } | null>(null);

  const idempotencyKey = useRef<string | null>(null);
  const reverseGeocodeAbort = useRef<AbortController | null>(null);

  const update = (patch: Partial<WizardData>) => setData((current) => ({ ...current, ...patch }));

  const hospitalMatches = useMemo(() => {
    const query = hospitalQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return verifiedHospitals
      .filter(
        (hospital) =>
          hospital.name.toLowerCase().includes(query) ||
          hospital.district.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [hospitalQuery]);

  /* ---------------------------------------------------------------- */
  /* Geolocation                                                       */
  /* ---------------------------------------------------------------- */

  function requestLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({
        kind: "unavailable",
        message: "This browser does not offer location access. Enter the pickup address by hand.",
      });
      return;
    }
    setGeo({ kind: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const locationAccuracy = Number.isFinite(accuracy) ? Math.round(accuracy) : null;
        setGeo({
          kind: "granted",
          latitude,
          longitude,
          accuracy: locationAccuracy,
          address: null,
          resolvingAddress: true,
          addressError: null,
          mapUnavailable: false,
        });
        update({
          pickupSource: "browser_geolocation",
          pickupLatitude: latitude,
          pickupLongitude: longitude,
          pickupAccuracyMeters: locationAccuracy,
        });

        // A position fix is not a usable dispatch address by itself. Resolve it
        // through the server proxy, then leave the result editable for the
        // requester to confirm. A failed lookup never blocks manual booking.
        reverseGeocodeAbort.current?.abort();
        const controller = new AbortController();
        reverseGeocodeAbort.current = controller;
        void geoApi
          .reverseGeocode(latitude, longitude, controller.signal)
          .then((resolved) => {
            if (controller.signal.aborted) return;
            setGeo((current) =>
              current.kind === "granted" && current.latitude === latitude && current.longitude === longitude
                ? { ...current, address: resolved.formatted, resolvingAddress: false, addressError: null }
                : current,
            );
            setData((current) =>
              current.pickupAddress.trim()
                ? current
                : { ...current, pickupAddress: resolved.formatted },
            );
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted) return;
            setGeo((current) =>
              current.kind === "granted" && current.latitude === latitude && current.longitude === longitude
                ? {
                    ...current,
                    resolvingAddress: false,
                    addressError:
                      error instanceof Error
                        ? `${error.message} Enter the pickup address manually.`
                        : "The pickup address could not be resolved. Enter it manually.",
                  }
                : current,
            );
          });
      },
      (error) => {
        const map: Record<number, string> = {
          1: "You declined location access. That is completely fine — type the pickup address instead.",
          2: "Your location could not be determined right now. Type the pickup address instead.",
          3: "The location request timed out. Type the pickup address instead.",
        };
        const message = map[error.code] ?? "Location could not be read. Type the pickup address instead.";
        setGeo({ kind: error.code === 1 ? "denied" : "unavailable", message });
        update({ pickupSource: "manual", pickupLatitude: null, pickupLongitude: null, pickupAccuracyMeters: null });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  function clearLocation() {
    reverseGeocodeAbort.current?.abort();
    setGeo({ kind: "idle" });
    update({
      pickupSource: "manual",
      pickupLatitude: null,
      pickupLongitude: null,
      pickupAccuracyMeters: null,
    });
  }

  useEffect(
    () => () => {
      reverseGeocodeAbort.current?.abort();
    },
    [],
  );

  function markMapUnavailable() {
    setGeo((current) =>
      current.kind === "granted" ? { ...current, mapUnavailable: true } : current,
    );
  }

  /* ---------------------------------------------------------------- */
  /* Operators                                                         */
  /* ---------------------------------------------------------------- */

  async function loadProviders() {
    setProvidersLoading(true);
    setProvidersError(null);
    try {
      const response = await ambulanceApi.providers({ category: data.category ?? undefined });
      setProviders(response.providers);
      setProvidersNote(response.availabilityNote);
    } catch (error) {
      setProviders(null);
      setProvidersError(
        error instanceof AmbulanceApiError ? error.message : "MEDIPAL could not load ambulance operators.",
      );
    } finally {
      setProvidersLoading(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Validation & navigation                                           */
  /* ---------------------------------------------------------------- */

  function validateStep(index: number): boolean {
    const next: Record<string, string> = {};
    if (index === 0) {
      if (!data.category) next.category = "Choose the kind of ambulance you need.";
      if (!data.urgency) next.urgency = "Tell us whether this is an emergency or a planned transport.";
    }
    if (index === 1) {
      if (data.pickupAddress.trim().length < 5) {
        next.pickupAddress = "Enter the address the vehicle should reach (at least 5 characters).";
      }
    }
    if (index === 4) {
      if (data.patientName.trim().length < 2) next.patientName = "Enter the patient's name.";
      if (!MOBILE_RE.test(data.contactPhone.trim())) {
        next.contactPhone = "Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.";
      }
      if (!data.consentToShare) {
        next.consentToShare = "Consent is required before your details can be shared with an operator.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goTo(index: number) {
    setStep(index);
    if (index === 3 && providers === null && !providersLoading) void loadProviders();
  }

  function next() {
    if (!validateStep(step)) return;
    goTo(Math.min(step + 1, STEPS.length - 1));
  }

  function back() {
    setErrors({});
    setStep((value) => Math.max(0, value - 1));
  }

  /* ---------------------------------------------------------------- */
  /* Submit                                                            */
  /* ---------------------------------------------------------------- */

  async function submit() {
    if (!validateStep(4)) return;
    if (!data.category || !data.urgency) return;
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();

    const input: BookingInput = {
      category: data.category,
      urgency: data.urgency,
      providerId: data.providerId,
      patientName: data.patientName.trim(),
      contactPhone: data.contactPhone.trim(),
      patientAge: data.patientAge.trim() === "" ? null : Number(data.patientAge),
      patientSex: data.patientSex === "" ? null : data.patientSex,
      needs: data.needs,
      pickupAddress: data.pickupAddress.trim(),
      pickupSource: data.pickupSource,
      pickupLatitude: data.pickupLatitude,
      pickupLongitude: data.pickupLongitude,
      pickupAccuracyMeters: data.pickupAccuracyMeters,
      pickupLandmark: data.pickupLandmark.trim() || null,
      destinationName: data.destinationName.trim() || null,
      destinationAddress: data.destinationAddress.trim() || null,
      destinationPhone: data.destinationPhone.trim() || null,
      notes: data.notes.trim() || null,
      consentToShare: true,
      idempotencyKey: idempotencyKey.current,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await ambulanceApi.createBooking(input);
      rememberAmbulanceBooking({
        reference: response.booking.reference,
        phone: response.booking.contactPhone,
        category: response.booking.category,
        urgency: response.booking.urgency,
        createdAt: response.booking.createdAt,
      });
      setResult({ booking: response.booking, acceptanceNote: response.acceptanceNote });
      onBooked?.(response.booking);
    } catch (error) {
      setSubmitError(
        error instanceof AmbulanceApiError
          ? error.message
          : "The request could not be recorded. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Success                                                           */
  /* ---------------------------------------------------------------- */

  if (result) {
    return (
      <div className="glass-panel glass-hairline rounded-4xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ok/10 text-ok">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-content-primary">
              Request recorded
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-content-secondary">{result.acceptanceNote}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white/70 p-4">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-content-secondary">
              Reference
            </dt>
            <dd className="mt-1 font-mono text-lg font-semibold text-content-primary">
              {result.booking.reference}
            </dd>
            <p className="mt-1 text-[0.72rem] text-content-secondary">
              Keep this, with the contact number, to track the request.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-white/70 p-4">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-content-secondary">
              Operator
            </dt>
            <dd className="mt-1 text-sm font-semibold text-content-primary">
              {result.booking.providerName ?? "No operator selected"}
            </dd>
            {result.booking.providerPhone && (
              <a
                href={`tel:${result.booking.providerPhone}`}
                className="mt-1 inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-crimson-soft"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {result.booking.providerPhone}
              </a>
            )}
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={`/ambulance/track?reference=${encodeURIComponent(result.booking.reference)}&phone=${encodeURIComponent(
              result.booking.contactPhone,
            )}`}
            className="btn-primary px-5 py-2.5 text-sm"
          >
            Track this request
          </a>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setData(EMPTY);
              setErrors({});
              setGeo({ kind: "idle" });
              setProviders(null);
              setStep(0);
              idempotencyKey.current = null;
            }}
            className="btn-secondary px-5 py-2.5 text-sm"
          >
            Book another
          </button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="glass-panel glass-hairline rounded-4xl p-5 sm:p-8">
      <EuStepper steps={STEPS} current={step} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.32, ease: EASE_SMOOTH }}
        >
          {step === 0 && (
            <StepRequirement data={data} errors={errors} update={update} />
          )}
          {step === 1 && (
            <StepLocation
              data={data}
              errors={errors}
              update={update}
              geo={geo}
              onRequest={requestLocation}
              onClear={clearLocation}
              onMapUnavailable={markMapUnavailable}
            />
          )}
          {step === 2 && (
            <StepDestination
              data={data}
              update={update}
              hospitalQuery={hospitalQuery}
              setHospitalQuery={setHospitalQuery}
              matches={hospitalMatches}
            />
          )}
          {step === 3 && (
            <StepOperators
              providers={providers}
              loading={providersLoading}
              error={providersError}
              note={providersNote}
              category={data.category}
              selectedId={data.providerId}
              onSelect={(provider) =>
                update({ providerId: provider.id, providerName: provider.name })
              }
              onClear={() => update({ providerId: null, providerName: null })}
              onReload={loadProviders}
            />
          )}
          {step === 4 && (
            <StepPatient
              data={data}
              errors={errors}
              update={update}
              submitError={submitError}
              submitting={submitting}
              onSubmit={submit}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {step < 4 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="btn-secondary px-5 py-2.5 text-sm"
          >
            Back
          </button>
          <button type="button" onClick={next} className="btn-primary px-6 py-2.5 text-sm">
            Continue
          </button>
        </div>
      )}
      {step === 4 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={back} className="btn-secondary px-5 py-2.5 text-sm">
            Back
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small local form helpers                                            */
/* ------------------------------------------------------------------ */

/** A labelled field that leaves invalid/required marking to its child input. */
function EuFieldless({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eu-label">
        {label}
        {required && <span className="text-crimson-soft"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[0.72rem] leading-relaxed text-content-secondary">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

interface StepProps {
  data: WizardData;
  errors: Record<string, string>;
  update: (patch: Partial<WizardData>) => void;
}

function StepHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Stethoscope;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-white/80 text-crimson-bright">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div>
        <h3 className="font-display text-lg font-semibold text-content-primary">{title}</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-content-secondary">{description}</p>
      </div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  title,
  subtitle,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-full w-full flex-col rounded-2xl border p-4 text-left transition-all duration-300 ease-smooth",
        active
          ? "border-crimson/60 bg-blush/70 shadow-glass"
          : "border-line bg-white/70 hover:-translate-y-0.5 hover:border-crimson/35",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-content-primary">{title}</span>
        {badge && (
          <span className="rounded-full border border-line bg-white/80 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-content-secondary">
            {badge}
          </span>
        )}
      </span>
      {subtitle && (
        <span className="mt-1.5 text-[0.78rem] leading-relaxed text-content-secondary">{subtitle}</span>
      )}
    </button>
  );
}

function StepRequirement({ data, errors, update }: StepProps) {
  return (
    <div>
      <StepHeading
        icon={Stethoscope}
        title="What do you need?"
        description="Choose the level of care. If you are unsure, telephone the operator and describe the patient's condition."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {AMBULANCE_CATEGORIES.map((category) => (
          <Choice
            key={category}
            active={data.category === category}
            onClick={() => update({ category })}
            title={CATEGORY_META[category].short}
            badge={CATEGORY_META[category].short}
            subtitle={`${category} — ${CATEGORY_META[category].blurb}`}
          />
        ))}
      </div>
      {errors.category && <p className="field-error">{errors.category}</p>}

      <h4 className="mt-6 text-sm font-semibold text-content-primary">How urgent is it?</h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Choice
          active={data.urgency === "emergency"}
          onClick={() => update({ urgency: "emergency" })}
          title="Emergency"
          subtitle="The patient needs to reach hospital now. Telephone 112 or 108 as well as using MEDIPAL."
        />
        <Choice
          active={data.urgency === "non_emergency"}
          onClick={() => update({ urgency: "non_emergency" })}
          title="Planned transport"
          subtitle="A stable patient being moved between home, hospital or a diagnostic centre."
        />
      </div>
      {errors.urgency && <p className="field-error">{errors.urgency}</p>}

      {data.urgency === "emergency" && (
        <EuNotice tone="error" title="For a life-threatening emergency, call first" className="mt-4">
          Dial <strong>112</strong> (or <strong>108</strong> for an ambulance) before or while you
          submit this request. MEDIPAL records a request with an operator — it does not summon help
          by itself.
        </EuNotice>
      )}

      <h4 className="mt-6 text-sm font-semibold text-content-primary">
        Does the patient need any of these?
      </h4>
      <p className="mt-1 text-[0.78rem] text-content-secondary">Optional, but it helps the operator prepare.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {AMBULANCE_NEEDS.map((need) => {
          const active = data.needs.includes(need);
          return (
            <button
              key={need}
              type="button"
              aria-pressed={active}
              onClick={() =>
                update({
                  needs: active ? data.needs.filter((item) => item !== need) : [...data.needs, need],
                })
              }
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[0.78rem] font-medium transition-all duration-300 ease-smooth",
                active
                  ? "border-crimson/60 bg-blush text-crimson-soft"
                  : "border-line bg-white/70 text-content-secondary hover:border-crimson/35",
              )}
            >
              {NEED_LABEL[need]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepLocation({
  data,
  errors,
  update,
  geo,
  onRequest,
  onClear,
  onMapUnavailable,
}: StepProps & {
  geo: GeoState;
  onRequest: () => void;
  onClear: () => void;
  onMapUnavailable: () => void;
}) {
  return (
    <div>
      <StepHeading
        icon={MapPin}
        title="Where should the vehicle come?"
        description="Share your location for accuracy, or type the address. Either way, confirm the address before you continue."
      />

      <div className="rounded-3xl border border-line bg-white/70 p-4">
        {geo.kind === "granted" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ok/10 text-ok">
                <LocateFixed className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-content-primary">Location captured</p>
                <p className="mt-0.5 font-mono text-[0.74rem] text-content-secondary">
                  {geo.latitude.toFixed(5)}, {geo.longitude.toFixed(5)}
                  {geo.accuracy !== null ? ` · ±${Math.round(geo.accuracy)} m` : ""}
                </p>
                {geo.resolvingAddress && (
                  <p className="mt-1 text-[0.74rem] text-content-secondary">
                    Looking up the address so you can confirm it…
                  </p>
                )}
                {geo.address && !geo.resolvingAddress && (
                  <p className="mt-1 max-w-xl text-[0.74rem] leading-relaxed text-content-secondary">
                    Detected address: {geo.address}
                  </p>
                )}
              </div>
            </div>
            <button type="button" onClick={onClear} className="btn-ghost px-3 py-1.5 text-[0.78rem]">
              Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-crimson-bright">
                <Crosshair className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-content-primary">Use my current location</p>
                <p className="mt-0.5 text-[0.78rem] text-content-secondary">
                  Your browser will ask for permission. You can decline and type the address instead.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRequest}
              disabled={geo.kind === "requesting"}
              className="btn-secondary px-4 py-2 text-[0.8rem]"
            >
              {geo.kind === "requesting" ? "Requesting…" : "Get my location"}
            </button>
          </div>
        )}

        {(geo.kind === "denied" || geo.kind === "unavailable") && (
          <EuNotice tone="info" className="mt-3">
            {geo.message}
          </EuNotice>
        )}
      </div>

      {geo.kind === "granted" && (
        <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-white/70">
          {!geo.mapUnavailable ? (
            <>
              <img
                src={staticMapUrl(geo.latitude, geo.longitude)}
                alt="Map preview centred on the detected pickup location"
                className="h-44 w-full object-cover sm:h-52"
                onError={onMapUnavailable}
              />
              <p className="border-t border-line px-4 py-2.5 text-[0.72rem] leading-relaxed text-content-secondary">
                This one-time map preview is centred on your device location. Review and edit the
                pickup address below; MEDIPAL does not track your location in the background.
              </p>
            </>
          ) : (
            <p className="px-4 py-3 text-[0.78rem] leading-relaxed text-content-secondary">
              The map preview is unavailable right now. Your captured location is still available;
              please confirm the pickup address below.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-4">
        <EuFieldless
          label="Pickup address"
          required
          hint="House or building, street, area and city. The crew needs enough to find you."
        >
          <textarea
            className="field min-h-[88px] resize-y"
            value={data.pickupAddress}
            aria-invalid={Boolean(errors.pickupAddress)}
            onChange={(event) => update({ pickupAddress: event.target.value })}
            placeholder="e.g. Flat 3B, Rajendra Nagar, Kankarbagh, Patna"
          />
        </EuFieldless>
        {errors.pickupAddress && <p className="field-error">{errors.pickupAddress}</p>}

        {geo.kind === "granted" && geo.addressError && (
          <EuNotice tone="info">{geo.addressError}</EuNotice>
        )}

        <EuFieldless label="Nearby landmark (optional)">
          <input
            className="field"
            value={data.pickupLandmark}
            onChange={(event) => update({ pickupLandmark: event.target.value })}
            placeholder="e.g. Opposite the district court gate"
          />
        </EuFieldless>

        <p className="text-[0.72rem] leading-relaxed text-content-secondary/90">
          Pickup recorded as:{" "}
          <strong>
            {data.pickupSource === "browser_geolocation"
              ? "device location"
              : "address you typed"}
          </strong>
          . MEDIPAL never guesses a location.
        </p>
      </div>
    </div>
  );
}

function StepDestination({
  data,
  update,
  hospitalQuery,
  setHospitalQuery,
  matches,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  hospitalQuery: string;
  setHospitalQuery: (value: string) => void;
  matches: readonly { id: string; name: string; district: string; phone: string | null }[];
}) {
  return (
    <div>
      <StepHeading
        icon={Hospital}
        title="Where is the patient going?"
        description="Choose a hospital from the MEDIPAL directory, or type any destination. This is optional if you are not sure yet."
      />

      <EuFieldless label="Search the hospital directory" hint="Search by hospital name or district.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-secondary" aria-hidden />
          <input
            className="field pl-10"
            value={hospitalQuery}
            onChange={(event) => setHospitalQuery(event.target.value)}
            placeholder="e.g. Patna or Anugrah Narayan"
          />
        </div>
      </EuFieldless>

      {matches.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-line bg-white/80 p-1">
          {matches.map((hospital) => (
            <li key={hospital.id}>
              <button
                type="button"
                onClick={() => {
                  update({
                    destinationName: hospital.name,
                    destinationPhone: hospital.phone ?? "",
                  });
                  setHospitalQuery("");
                }}
                className="flex w-full flex-col rounded-xl px-3.5 py-2.5 text-left transition-colors hover:bg-blush/60"
              >
                <span className="text-sm font-medium text-content-primary">{hospital.name}</span>
                <span className="text-[0.74rem] text-content-secondary">
                  {hospital.district}
                  {hospital.phone ? ` · ${hospital.phone}` : " · no published number"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-4">
        <EuFieldless label="Destination hospital / place">
          <input
            className="field"
            value={data.destinationName}
            onChange={(event) => update({ destinationName: event.target.value })}
            placeholder="Hospital or place name"
          />
        </EuFieldless>
        <EuFieldless label="Destination address (optional)">
          <input
            className="field"
            value={data.destinationAddress}
            onChange={(event) => update({ destinationAddress: event.target.value })}
            placeholder="Street, area, city"
          />
        </EuFieldless>
        <EuFieldless
          label="Destination telephone (optional)"
          hint="Reception or emergency number, if you have it. Landlines and short numbers are accepted."
        >
          <input
            className="field"
            value={data.destinationPhone}
            onChange={(event) => update({ destinationPhone: event.target.value })}
            placeholder="e.g. 0612 2222266"
          />
        </EuFieldless>
      </div>
    </div>
  );
}

function StepOperators({
  providers,
  loading,
  error,
  note,
  category,
  selectedId,
  onSelect,
  onClear,
  onReload,
}: {
  providers: AmbulanceProvider[] | null;
  loading: boolean;
  error: string | null;
  note: string;
  category: AmbulanceCategory | null;
  selectedId: string | null;
  onSelect: (provider: AmbulanceProvider) => void;
  onClear: () => void;
  onReload: () => void;
}) {
  return (
    <div>
      <StepHeading
        icon={ShieldAlert}
        title="Ambulance operators"
        description="These are operators MEDIPAL has approved for the category you chose. Availability is their own latest confirmation — not a live feed."
      />

      {note && (
        <EuNotice tone="info" className="mb-4">
          {note}
        </EuNotice>
      )}

      {selectedId && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-crimson/40 bg-blush/60 p-3.5">
          <p className="text-sm font-medium text-content-primary">
            Selected: {/* the name is echoed from the chosen card */}
            <span className="font-semibold">{providers?.find((p) => p.id === selectedId)?.name ?? "Operator"}</span>
          </p>
          <button type="button" onClick={onClear} className="btn-ghost px-3 py-1.5 text-[0.78rem]">
            Clear selection
          </button>
        </div>
      )}

      {loading && (
        <p className="flex items-center gap-2 rounded-2xl border border-line bg-white/70 p-4 text-sm text-content-secondary">
          <Search className="h-4 w-4 animate-pulse" aria-hidden />
          Looking for approved operators…
        </p>
      )}

      {error && (
        <EuNotice
          tone="error"
          title="Operators could not be loaded"
          action={
            <button type="button" onClick={onReload} className="btn-secondary px-4 py-2 text-[0.8rem]">
              Try again
            </button>
          }
        >
          {error}
        </EuNotice>
      )}

      {!loading && !error && providers && providers.length === 0 && (
        <EuNotice tone="warn" title="No approved operator is listed for this category yet">
          MEDIPAL has not onboarded an operator that runs {category ?? "this category"} in its
          directory. You can still record the request without selecting an operator, or telephone the
          numbers on the emergency panel. MEDIPAL will not invent an operator or a fare to fill this
          gap.
        </EuNotice>
      )}

      {!loading && !error && providers && providers.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              focusCategory={category}
              busy={false}
              onBook={(selected) => onSelect(selected)}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-[0.78rem] leading-relaxed text-content-secondary">
        Prefer not to choose? Continue without selecting an operator and MEDIPAL will record the
        request for you to arrange transport directly.
      </p>
    </div>
  );
}

function StepPatient({
  data,
  errors,
  update,
  submitError,
  submitting,
  onSubmit,
}: StepProps & { submitError: string | null; submitting: boolean; onSubmit: () => void }) {
  return (
    <div>
      <StepHeading
        icon={User}
        title="Patient details and consent"
        description="The operator needs a name and a number to call back. Nothing is shared until you tick the consent box."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <EuFieldless label="Patient name" required>
          <input
            className="field"
            value={data.patientName}
            aria-invalid={Boolean(errors.patientName)}
            onChange={(event) => update({ patientName: event.target.value })}
            placeholder="Full name"
          />
          {errors.patientName && <span className="field-error">{errors.patientName}</span>}
        </EuFieldless>

        <EuFieldless label="Contact number" required hint="A 10-digit mobile the operator can call.">
          <input
            className="field"
            inputMode="numeric"
            value={data.contactPhone}
            aria-invalid={Boolean(errors.contactPhone)}
            onChange={(event) => update({ contactPhone: event.target.value.replace(/[^\d]/g, "").slice(0, 10) })}
            placeholder="10-digit mobile"
          />
          {errors.contactPhone && <span className="field-error">{errors.contactPhone}</span>}
        </EuFieldless>

        <EuFieldless label="Patient age (optional)">
          <input
            className="field"
            inputMode="numeric"
            value={data.patientAge}
            onChange={(event) => update({ patientAge: event.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
            placeholder="Years"
          />
        </EuFieldless>

        <EuFieldless label="Patient sex (optional)">
          <select
            className="field"
            value={data.patientSex}
            onChange={(event) =>
              update({ patientSex: event.target.value as WizardData["patientSex"] })
            }
          >
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="undisclosed">Undisclosed</option>
          </select>
        </EuFieldless>
      </div>

      <EuFieldless label="Anything the crew should know? (optional)">
        <textarea
          className="field mt-2 min-h-[80px] resize-y"
          value={data.notes}
          onChange={(event) => update({ notes: event.target.value })}
          placeholder="e.g. Fourth floor, no lift. Patient is on oxygen."
        />
      </EuFieldless>

      <label
        className={cn(
          "mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
          errors.consentToShare ? "border-crimson/60 bg-blush/50" : "border-line bg-white/70",
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#0b5fa5]"
          checked={data.consentToShare}
          onChange={(event) => update({ consentToShare: event.target.checked })}
        />
        <span className="text-[0.8rem] leading-relaxed text-content-secondary">
          I agree that the patient's name, contact number and pickup location may be shared with the
          operator I selected so they can respond. This is required by law and by MEDIPAL policy.
        </span>
      </label>
      {errors.consentToShare && <p className="field-error">{errors.consentToShare}</p>}

      <EuNotice tone="warn" title="What happens when you submit" className="mt-5">
        MEDIPAL records a request. No vehicle is assigned by MEDIPAL, and no confirmation is implied
        until the operator themselves accepts. For a life-threatening emergency, telephone 112 first.
      </EuNotice>

      {submitError && (
        <EuNotice tone="error" title="The request was not recorded" className="mt-4">
          {submitError}
        </EuNotice>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="btn-primary px-6 py-3 text-sm"
        >
          <Send className="h-4 w-4" aria-hidden />
          {submitting ? "Recording…" : "Record this request"}
        </button>
        {data.contactPhone && (
          <span className="inline-flex items-center gap-2 text-[0.78rem] text-content-secondary">
            <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden />
            You can cancel from the tracking page until an operator accepts.
          </span>
        )}
      </div>
    </div>
  );
}
