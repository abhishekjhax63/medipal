import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheckBig,
  ClipboardCheck,
  Copy,
  Droplets,
  HeartPulse,
  LoaderCircle,
  MapPin,
  Pencil,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { scrollToId } from "@/components/blood-bank/bloodBankScroll";
import { indianStates, type BloodGroup } from "@/data/bloodGroups";
import { EASE_SMOOTH } from "@/lib/animations";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { REQUEST_STATUS_LABEL, absoluteTime } from "@/lib/blood/presentation";
import { BloodApiError, bloodApi } from "@/services/blood/api";
import { BLOOD_COMPONENTS, BLOOD_PRIORITIES, FOR_WHOM_OPTIONS } from "@/services/blood/types";
import type {
  BloodComponent,
  BloodPriority,
  BloodRequestResult,
  ForWhom,
} from "@/services/blood/types";

type Values = {
  forWhom: ForWhom | "";
  priority: BloodPriority | "";
  reason: string;
  bloodGroup: BloodGroup | "";
  component: BloodComponent | "";
  units: string;
  requiredBy: string;
  state: string;
  district: string;
  city: string;
  postalCode: string;
  hospitalName: string;
  patientReference: string;
  requesterName: string;
  contactPhone: string;
  contactEmail: string;
  consent: boolean;
};

type FieldKey = keyof Values;
type Errors = Partial<Record<FieldKey, string>>;

const EMPTY: Values = {
  forWhom: "",
  priority: "",
  reason: "",
  bloodGroup: "",
  component: "",
  units: "",
  requiredBy: "",
  state: "",
  district: "",
  city: "",
  postalCode: "",
  hospitalName: "",
  patientReference: "",
  requesterName: "",
  contactPhone: "",
  contactEmail: "",
  consent: false,
};

const PHONE_PATTERN = /^[6-9]\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors `FOR_WHOM_OPTIONS` on the server, with plainer front-end labels. */
const FOR_WHOM_LABELS: Record<ForWhom, string> = {
  Self: "Myself",
  "Family member": "A family member",
  "Patient under my care": "A patient under my care",
  Other: "Someone else",
};

const PRIORITY_HINTS: Record<BloodPriority, string> = {
  Routine: "Can be arranged on the normal schedule.",
  Urgent: "Needed soon — a facility should respond quickly.",
  "Stat Emergency": "Immediate need. The hospital must be named so a facility can verify it.",
};

const STEP_META = [
  { label: "Request details", title: "Who is this request for?", icon: HeartPulse },
  { label: "Blood & timing", title: "Blood group, component and timing", icon: Droplets },
  { label: "Required location", title: "Where is the blood needed?", icon: MapPin },
  { label: "Hospital & contact", title: "Hospital and contact details", icon: Stethoscope },
  { label: "Review", title: "Review your request", icon: ShieldCheck },
  { label: "Recorded", title: "Request recorded", icon: CircleCheckBig },
] as const;

const LAST_FORM_STEP = 4;
const CONFIRMATION_STEP = 5;

/** Pure per-step validator — returns one message per invalid field. */
function validateStep(index: number, values: Values): Errors {
  const errors: Errors = {};

  if (index === 0) {
    if (!values.forWhom) errors.forWhom = "Choose who this request is for.";
    if (!values.priority) errors.priority = "Select how urgent this request is.";
    const reason = values.reason.trim();
    if (!reason) errors.reason = "Add a short note about the need.";
    else if (reason.length < 10) errors.reason = "Please add at least 10 characters.";
  } else if (index === 1) {
    if (!values.bloodGroup) errors.bloodGroup = "Select the blood group required.";
    if (!values.component) errors.component = "Select the blood component required.";
    const units = Number(values.units);
    if (!values.units.trim()) errors.units = "Enter the number of units required.";
    else if (!Number.isInteger(units) || units < 1 || units > 20)
      errors.units = "Enter a whole number between 1 and 20.";
    if (values.requiredBy) {
      const parsed = new Date(values.requiredBy);
      if (Number.isNaN(parsed.getTime())) errors.requiredBy = "Enter a valid date and time.";
      else if (parsed.getTime() < Date.now()) errors.requiredBy = "The required-by time must be in the future.";
    }
  } else if (index === 2) {
    if (!values.state.trim()) errors.state = "Select or type a state.";
    if (!values.city.trim()) errors.city = "Enter a city or town.";
    if (values.postalCode.trim() && !/^\d{6}$/.test(values.postalCode.trim()))
      errors.postalCode = "A PIN code must be 6 digits.";
  } else if (index === 3) {
    if (values.priority === "Stat Emergency" && !values.hospitalName.trim()) {
      errors.hospitalName =
        "A Stat Emergency request must name the hospital so a facility can verify it.";
    }
    if (!values.requesterName.trim()) errors.requesterName = "Enter a contact name.";
    else if (values.requesterName.trim().length < 2)
      errors.requesterName = "Please enter at least 2 characters.";
    const digits = values.contactPhone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (!values.contactPhone.trim()) errors.contactPhone = "Enter a contact phone number.";
    else if (!PHONE_PATTERN.test(digits)) errors.contactPhone = "Enter a valid 10-digit Indian mobile number.";
    if (values.contactEmail.trim() && !EMAIL_PATTERN.test(values.contactEmail.trim()))
      errors.contactEmail = "Enter a valid email address.";
  } else if (index === LAST_FORM_STEP) {
    if (!values.consent) errors.consent = "Please confirm the acknowledgement to continue.";
  }

  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error">
      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

function RequiredMark() {
  return (
    <span aria-hidden className="ml-1 text-crimson">
      *
    </span>
  );
}

function display(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed : "—";
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-line py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs uppercase tracking-[0.16em] text-content-secondary">{label}</dt>
      <dd className="text-right text-sm font-medium text-content-primary">{value}</dd>
    </div>
  );
}

/**
 * Six-step blood request wizard.
 *
 * The last step is a real submission: the request is written to the MEDIPAL
 * database and given a reference. MEDIPAL does not send it to any blood bank
 * automatically, does not reserve blood and does not contact donors, and the
 * confirmation says exactly that before showing the recorded reference.
 */
export function BloodRequestWizard() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const [result, setResult] = useState<BloodRequestResult | null>(null);
  const [submitError, setSubmitError] = useState<{ message: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const reduce = prefersReducedMotion();

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const errorCount = Object.keys(errors).length;

  const setField = <K extends FieldKey>(key: K, value: Values[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const submitRequest = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await bloodApi.createRequest({
        requesterName: values.requesterName.trim(),
        contactPhone: values.contactPhone.trim(),
        ...(values.contactEmail.trim() ? { contactEmail: values.contactEmail.trim() } : {}),
        forWhom: values.forWhom as ForWhom,
        bloodGroup: values.bloodGroup as BloodGroup,
        component: values.component as BloodComponent,
        unitsRequired: Number(values.units),
        priority: values.priority as BloodPriority,
        ...(values.requiredBy ? { requiredBy: new Date(values.requiredBy).toISOString() } : {}),
        ...(values.reason.trim() ? { clinicalIndication: values.reason.trim() } : {}),
        state: values.state.trim(),
        ...(values.district.trim() ? { district: values.district.trim() } : {}),
        city: values.city.trim(),
        ...(values.postalCode.trim() ? { postalCode: values.postalCode.trim() } : {}),
        ...(values.hospitalName.trim() ? { hospitalName: values.hospitalName.trim() } : {}),
        ...(values.patientReference.trim() ? { patientReference: values.patientReference.trim() } : {}),
        consentRecorded: true,
      });
      setResult(created);
      setStep(CONFIRMATION_STEP);
    } catch (error) {
      if (error instanceof BloodApiError) {
        setSubmitError({ message: error.message, code: error.code });
      } else {
        setSubmitError({
          message: "MEDIPAL could not record that request. Check your connection and try again.",
          code: "UNKNOWN",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step >= CONFIRMATION_STEP || submitting) return;

    const nextErrors = validateStep(step, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (step === LAST_FORM_STEP) {
      void submitRequest();
      return;
    }

    setStep(returnToReview ? LAST_FORM_STEP : step + 1);
    setReturnToReview(false);
  };

  const goBack = () => {
    if (step === 0 || submitting) return;
    setErrors({});
    setReturnToReview(false);
    setSubmitError(null);
    setStep((current) => Math.max(0, current - 1));
  };

  const editStep = (target: number) => {
    setErrors({});
    setReturnToReview(true);
    setStep(target);
  };

  const reset = () => {
    setSubmitting(false);
    setReturnToReview(false);
    setValues(EMPTY);
    setErrors({});
    setResult(null);
    setSubmitError(null);
    setCopied(false);
    setStep(0);
  };

  const copyReference = () => {
    if (!result) return;
    void navigator.clipboard
      ?.writeText(result.reference)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const stepMotion = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.15 },
      }
    : {
        initial: { opacity: 0, x: 28 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -28 },
        transition: { duration: 0.35, ease: EASE_SMOOTH },
      };

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="grid gap-5">
          <fieldset>
            <legend className="field-label">Who is this request for?</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {FOR_WHOM_OPTIONS.map((option) => {
                const active = values.forWhom === option;
                return (
                  <label
                    key={option}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors duration-300 ease-smooth",
                      active
                        ? "border-crimson bg-crimson/[0.06] text-content-primary"
                        : "border-line bg-white/70 text-content-secondary hover:border-crimson/30",
                    )}
                  >
                    <input
                      type="radio"
                      name="request-for-whom"
                      value={option}
                      checked={active}
                      onChange={() => setField("forWhom", option)}
                      className="h-4 w-4 shrink-0 accent-crimson"
                    />
                    {FOR_WHOM_LABELS[option]}
                  </label>
                );
              })}
            </div>
            <FieldError id="request-for-whom-error" message={errors.forWhom} />
          </fieldset>

          <fieldset>
            <legend className="field-label">Urgency</legend>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {BLOOD_PRIORITIES.map((option) => {
                const active = values.priority === option;
                return (
                  <label
                    key={option}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-2xl border px-4 py-3 text-sm transition-colors duration-300 ease-smooth",
                      active
                        ? "border-crimson bg-crimson/[0.06] text-content-primary"
                        : "border-line bg-white/70 text-content-secondary hover:border-crimson/30",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="request-priority"
                        value={option}
                        checked={active}
                        onChange={() => setField("priority", option)}
                        className="h-4 w-4 shrink-0 accent-crimson"
                      />
                      {option}
                    </span>
                    <span className="pl-7 text-xs leading-relaxed text-content-secondary">
                      {PRIORITY_HINTS[option]}
                    </span>
                  </label>
                );
              })}
            </div>
            <FieldError id="request-priority-error" message={errors.priority} />
          </fieldset>

          <div>
            <label className="field-label" htmlFor="request-reason">
              Clinical indication or notes
              <RequiredMark />
            </label>
            <textarea
              id="request-reason"
              name="reason"
              className="field min-h-[96px] resize-y"
              placeholder="e.g. Scheduled surgery requiring cross-matched red cells."
              value={values.reason}
              onChange={(event) => setField("reason", event.target.value)}
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={errors.reason ? "request-reason-error" : undefined}
            />
            <FieldError id="request-reason-error" message={errors.reason} />
          </div>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="grid gap-5">
          <fieldset>
            <legend className="field-label">Blood group required</legend>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const).map((group) => {
                const active = values.bloodGroup === group;
                return (
                  <label
                    key={group}
                    className={cn(
                      "flex cursor-pointer flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-3 font-display text-lg font-semibold transition-colors duration-300 ease-smooth focus-within:ring-2 focus-within:ring-crimson/40",
                      active
                        ? "border-crimson bg-crimson/[0.06] text-content-primary"
                        : "border-line bg-white/70 text-content-secondary hover:border-crimson/30",
                    )}
                  >
                    <input
                      type="radio"
                      name="request-blood-group"
                      value={group}
                      checked={active}
                      onChange={() => setField("bloodGroup", group)}
                      className="sr-only"
                    />
                    {group}
                    <span className="font-sans text-[0.6rem] font-medium uppercase tracking-[0.2em] text-content-secondary">
                      {group.endsWith("-") ? "Rh negative" : "Rh positive"}
                    </span>
                  </label>
                );
              })}
            </div>
            <FieldError id="request-blood-group-error" message={errors.bloodGroup} />
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="request-component">
                Component
                <RequiredMark />
              </label>
              <select
                id="request-component"
                name="component"
                className="field"
                value={values.component}
                onChange={(event) => setField("component", event.target.value as BloodComponent | "")}
                aria-invalid={Boolean(errors.component)}
                aria-describedby={errors.component ? "request-component-error" : undefined}
              >
                <option value="">Select a component</option>
                {BLOOD_COMPONENTS.map((component) => (
                  <option key={component} value={component}>
                    {component}
                  </option>
                ))}
              </select>
              <FieldError id="request-component-error" message={errors.component} />
            </div>

            <div>
              <label className="field-label" htmlFor="request-units">
                Units required
                <RequiredMark />
              </label>
              <input
                id="request-units"
                name="units"
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                className="field"
                placeholder="e.g. 2"
                value={values.units}
                onChange={(event) => setField("units", event.target.value)}
                aria-invalid={Boolean(errors.units)}
                aria-describedby={errors.units ? "request-units-error" : undefined}
              />
              <FieldError id="request-units-error" message={errors.units} />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="request-required-by">
              Required by{" "}
              <span className="normal-case tracking-normal text-content-secondary/60">(optional)</span>
            </label>
            <input
              id="request-required-by"
              name="requiredBy"
              type="datetime-local"
              className="field"
              value={values.requiredBy}
              onChange={(event) => setField("requiredBy", event.target.value)}
              aria-invalid={Boolean(errors.requiredBy)}
              aria-describedby={errors.requiredBy ? "request-required-by-error" : undefined}
            />
            <FieldError id="request-required-by-error" message={errors.requiredBy} />
            <p className="mt-2 text-xs leading-relaxed text-content-secondary/80">
              A time helps a facility judge urgency. It is recorded as entered and is not a promise
              that blood will arrive by then.
            </p>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="request-state">
              State
              <RequiredMark />
            </label>
            <input
              id="request-state"
              name="state"
              type="text"
              list="request-state-options"
              autoComplete="address-level1"
              className="field"
              placeholder="e.g. Bihar"
              value={values.state}
              onChange={(event) => setField("state", event.target.value)}
              aria-invalid={Boolean(errors.state)}
              aria-describedby={errors.state ? "request-state-error" : undefined}
            />
            <datalist id="request-state-options">
              {indianStates.map((state) => (
                <option key={state} value={state} />
              ))}
            </datalist>
            <FieldError id="request-state-error" message={errors.state} />
          </div>

          <div>
            <label className="field-label" htmlFor="request-district">
              District{" "}
              <span className="normal-case tracking-normal text-content-secondary/60">(optional)</span>
            </label>
            <input
              id="request-district"
              name="district"
              type="text"
              autoComplete="address-level2"
              className="field"
              placeholder="e.g. Patna"
              value={values.district}
              onChange={(event) => setField("district", event.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="request-city">
              City or town
              <RequiredMark />
            </label>
            <input
              id="request-city"
              name="city"
              type="text"
              autoComplete="address-level3"
              className="field"
              placeholder="e.g. Patna"
              value={values.city}
              onChange={(event) => setField("city", event.target.value)}
              aria-invalid={Boolean(errors.city)}
              aria-describedby={errors.city ? "request-city-error" : undefined}
            />
            <FieldError id="request-city-error" message={errors.city} />
          </div>

          <div>
            <label className="field-label" htmlFor="request-pin">
              PIN code{" "}
              <span className="normal-case tracking-normal text-content-secondary/60">(optional)</span>
            </label>
            <input
              id="request-pin"
              name="postalCode"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="postal-code"
              className="field"
              placeholder="6-digit PIN"
              value={values.postalCode}
              onChange={(event) =>
                setField("postalCode", event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              aria-invalid={Boolean(errors.postalCode)}
              aria-describedby={errors.postalCode ? "request-pin-error" : undefined}
            />
            <FieldError id="request-pin-error" message={errors.postalCode} />
            <p className="mt-2 text-xs leading-relaxed text-content-secondary/80">
              The location is used to match your request against facilities in the same area.
            </p>
          </div>
        </div>
      );
    }

    if (step === 3) {
      const hospitalRequired = values.priority === "Stat Emergency";
      return (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="request-hospital">
              Hospital or blood bank name
              {hospitalRequired ? (
                <RequiredMark />
              ) : (
                <span className="ml-1 normal-case tracking-normal text-content-secondary/60">(optional)</span>
              )}
            </label>
            <input
              id="request-hospital"
              name="hospitalName"
              type="text"
              className="field"
              placeholder="e.g. City General Hospital"
              value={values.hospitalName}
              onChange={(event) => setField("hospitalName", event.target.value)}
              aria-invalid={Boolean(errors.hospitalName)}
              aria-describedby={errors.hospitalName ? "request-hospital-error" : undefined}
            />
            <FieldError id="request-hospital-error" message={errors.hospitalName} />
            {!hospitalRequired ? (
              <p className="mt-2 text-xs leading-relaxed text-content-secondary/80">
                Naming the hospital helps facilities verify the request. It is required for a Stat
                Emergency.
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="request-patient-ref">
              Patient reference{" "}
              <span className="normal-case tracking-normal text-content-secondary/60">(optional)</span>
            </label>
            <input
              id="request-patient-ref"
              name="patientReference"
              type="text"
              className="field"
              placeholder="Hospital admission or case number"
              value={values.patientReference}
              onChange={(event) => setField("patientReference", event.target.value)}
            />
            <p className="mt-2 text-xs leading-relaxed text-content-secondary/80">
              Do not enter a full Aadhaar or other government identification number.
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="request-contact-name">
              Contact name
              <RequiredMark />
            </label>
            <input
              id="request-contact-name"
              name="requesterName"
              type="text"
              autoComplete="name"
              className="field"
              placeholder="e.g. Ananya Sharma"
              value={values.requesterName}
              onChange={(event) => setField("requesterName", event.target.value)}
              aria-invalid={Boolean(errors.requesterName)}
              aria-describedby={errors.requesterName ? "request-contact-name-error" : undefined}
            />
            <FieldError id="request-contact-name-error" message={errors.requesterName} />
          </div>

          <div>
            <label className="field-label" htmlFor="request-contact-phone">
              Contact phone number
              <RequiredMark />
            </label>
            <input
              id="request-contact-phone"
              name="contactPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="field"
              placeholder="10-digit mobile number"
              value={values.contactPhone}
              onChange={(event) => setField("contactPhone", event.target.value)}
              aria-invalid={Boolean(errors.contactPhone)}
              aria-describedby={errors.contactPhone ? "request-contact-phone-error" : undefined}
            />
            <FieldError id="request-contact-phone-error" message={errors.contactPhone} />
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="request-contact-email">
              Email{" "}
              <span className="normal-case tracking-normal text-content-secondary/60">(optional)</span>
            </label>
            <input
              id="request-contact-email"
              name="contactEmail"
              type="email"
              autoComplete="email"
              className="field"
              placeholder="you@example.com"
              value={values.contactEmail}
              onChange={(event) => setField("contactEmail", event.target.value)}
              aria-invalid={Boolean(errors.contactEmail)}
              aria-describedby={errors.contactEmail ? "request-contact-email-error" : undefined}
            />
            <FieldError id="request-contact-email-error" message={errors.contactEmail} />
          </div>
        </div>
      );
    }

    if (step === LAST_FORM_STEP) {
      return (
        <div className="grid gap-5">
          <div className="rounded-2xl border border-line bg-white/70 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-display text-base font-semibold tracking-[-0.01em] text-content-primary">
                Request details
              </h4>
              <button
                type="button"
                onClick={() => editStep(0)}
                className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                aria-label="Edit request details"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit
              </button>
            </div>
            <dl className="mt-3">
              <ReviewRow
                label="For"
                value={values.forWhom ? FOR_WHOM_LABELS[values.forWhom] : "—"}
              />
              <ReviewRow label="Urgency" value={values.priority || "—"} />
              <ReviewRow label="Notes" value={display(values.reason)} />
            </dl>
          </div>

          <div className="rounded-2xl border border-line bg-white/70 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-display text-base font-semibold tracking-[-0.01em] text-content-primary">
                Blood and timing
              </h4>
              <button
                type="button"
                onClick={() => editStep(1)}
                className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                aria-label="Edit blood group and timing"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit
              </button>
            </div>
            <dl className="mt-3">
              <ReviewRow label="Blood group" value={values.bloodGroup || "—"} />
              <ReviewRow label="Component" value={values.component || "—"} />
              <ReviewRow label="Units" value={display(values.units)} />
              <ReviewRow
                label="Required by"
                value={values.requiredBy ? absoluteTime(new Date(values.requiredBy).toISOString()) : "—"}
              />
            </dl>
          </div>

          <div className="rounded-2xl border border-line bg-white/70 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-display text-base font-semibold tracking-[-0.01em] text-content-primary">
                Required location
              </h4>
              <button
                type="button"
                onClick={() => editStep(2)}
                className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                aria-label="Edit required location"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit
              </button>
            </div>
            <dl className="mt-3">
              <ReviewRow label="State" value={display(values.state)} />
              <ReviewRow label="District" value={display(values.district)} />
              <ReviewRow label="City" value={display(values.city)} />
              <ReviewRow label="PIN" value={display(values.postalCode)} />
            </dl>
          </div>

          <div className="rounded-2xl border border-line bg-white/70 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-display text-base font-semibold tracking-[-0.01em] text-content-primary">
                Hospital and contact
              </h4>
              <button
                type="button"
                onClick={() => editStep(3)}
                className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                aria-label="Edit hospital and contact details"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit
              </button>
            </div>
            <dl className="mt-3">
              <ReviewRow label="Hospital" value={display(values.hospitalName)} />
              <ReviewRow label="Patient ref." value={display(values.patientReference)} />
              <ReviewRow label="Contact" value={display(values.requesterName)} />
              <ReviewRow label="Phone" value={display(values.contactPhone)} />
              <ReviewRow label="Email" value={display(values.contactEmail)} />
            </dl>
          </div>

          <div>
            <label
              htmlFor="request-consent"
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3.5 text-sm leading-relaxed text-content-secondary transition-colors duration-300 ease-smooth hover:border-crimson/40"
            >
              <input
                id="request-consent"
                name="consent"
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-crimson"
                checked={values.consent}
                onChange={(event) => setField("consent", event.target.checked)}
                aria-invalid={Boolean(errors.consent)}
                aria-describedby={errors.consent ? "request-consent-error" : undefined}
              />
              <span>
                I consent to MEDIPAL recording these details and sharing them with approved blood
                banks and blood centres that may be able to help. I understand MEDIPAL does not
                reserve blood, does not dispatch help, and is not an emergency service.
              </span>
            </label>
            <FieldError id="request-consent-error" message={errors.consent} />
          </div>

          {submitError ? (
            <div className="flex items-start gap-3 rounded-2xl border border-crimson/40 bg-crimson/[0.06] px-4 py-3.5">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
              <div>
                <p className="text-sm font-medium text-content-primary">
                  The request could not be recorded
                </p>
                <p className="mt-1 text-sm leading-relaxed text-content-secondary">
                  {submitError.message}
                </p>
                <p className="mt-1.5 text-xs uppercase tracking-[0.16em] text-content-secondary/70">
                  Code {submitError.code}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    if (result) {
      return (
        <div className="text-center">
          <span
            aria-hidden
            className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-blush shadow-glow-red-sm"
          >
            <CircleCheckBig className="h-7 w-7 text-crimson" />
          </span>

          <h4 className="mt-5 font-display text-xl font-semibold tracking-[-0.01em] text-content-primary">
            Request recorded — reference {result.reference}
          </h4>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-content-secondary">
            Status: <span className="font-medium text-content-primary">{REQUEST_STATUS_LABEL[result.status]}</span>.
            Recorded {absoluteTime(result.createdAt)}.
          </p>

          <div className="mx-auto mt-5 flex max-w-md flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={copyReference}
              aria-live="polite"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Reference copied" : `Copy ${result.reference}`}
            </button>
          </div>

          <ul className="mx-auto mt-6 max-w-2xl space-y-3 text-left">
            {result.truthfulness.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2.5 rounded-2xl border border-line bg-white/70 px-4 py-3 text-sm leading-relaxed text-content-secondary"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
                {line}
              </li>
            ))}
          </ul>

          <div className="mx-auto mt-5 max-w-2xl rounded-2xl border border-line bg-blush-soft p-5 text-left">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-content-secondary">
              What to do next
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-content-secondary">
              {result.nextSteps.map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-crimson" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <p className="mx-auto mt-4 max-w-2xl text-xs leading-relaxed text-content-secondary/80">
            {result.tracking.howTo}
          </p>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => scrollToId("track-request")}
            >
              <Search className="h-4 w-4" aria-hidden />
              Track this request
            </button>
            <button type="button" className="btn-secondary" onClick={reset}>
              <HeartPulse className="h-4 w-4" aria-hidden />
              Start a new request
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="text-center">
        <CircleAlert className="mx-auto h-8 w-8 text-crimson-bright" aria-hidden />
        <p className="mt-4 text-sm leading-relaxed text-content-secondary">
          The request was not recorded, so no reference exists. Return to the review step and try
          again.
        </p>
        <button type="button" className="btn-secondary mt-5" onClick={() => setStep(LAST_FORM_STEP)}>
          Back to review
        </button>
      </div>
    );
  };

  return (
    <section id="request-blood" className="section-shell section-pad scroll-mt-28">
      <SectionHeading
        eyebrow="Blood request"
        title="Record a blood request in six guided steps"
        description="Walk through who the request is for, the group and component, the location and the contact details. Submitting writes the request to MEDIPAL and issues a reference you can track — it does not contact a blood bank for you."
      />

      <div className="mt-14">
        <GlassCard hairline interactive={false} className="p-5 sm:p-9">
          <p className="mb-6 flex items-start gap-2.5 rounded-2xl border border-line bg-blush-soft px-4 py-3 text-xs leading-relaxed text-content-secondary">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
            MEDIPAL is a coordination directory, not a blood bank and not an emergency service.
            Submitting a request records it — it does not reserve blood, contact donors, or dispatch
            help. For a medical emergency, call 112 or go to the nearest hospital now.
          </p>

          {/* Progress */}
          <div className="mb-7">
            <div className="mb-3 flex items-center justify-between gap-4 text-xs font-medium text-content-secondary">
              <span>
                Step {step + 1} of {STEP_META.length}
              </span>
              <span aria-hidden>{STEP_META[step].label}</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={STEP_META.length}
              aria-valuenow={step + 1}
              aria-valuetext={`Step ${step + 1} of ${STEP_META.length}: ${STEP_META[step].label}`}
              className="h-1.5 w-full overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-crimson transition-[width] duration-500 ease-smooth"
                style={{ width: `${((step + 1) / STEP_META.length) * 100}%` }}
              />
            </div>

            <ol className="mt-4 flex flex-wrap gap-2" aria-label="Request steps">
              {STEP_META.map((meta, index) => {
                const complete = index < step;
                const current = index === step;
                const Icon = complete ? CircleCheckBig : meta.icon;
                return (
                  <li
                    key={meta.label}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.7rem] font-medium",
                      complete
                        ? "border-line bg-white/70 text-content-secondary"
                        : current
                          ? "border-crimson bg-crimson/[0.06] text-content-primary"
                          : "border-line bg-white/50 text-content-secondary/70",
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", current || complete ? "text-crimson" : "")} aria-hidden />
                    <span className="whitespace-nowrap">{meta.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-lg font-semibold tracking-[-0.01em] text-content-primary outline-none sm:text-xl"
            >
              {STEP_META[step].title}
            </h3>

            <div className="mt-6" aria-live="polite">
              {errorCount > 0 && step < CONFIRMATION_STEP && (
                <p className="mb-5 flex items-start gap-2.5 rounded-2xl border border-crimson/40 bg-crimson/[0.06] px-4 py-3 text-sm leading-relaxed text-content-primary">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
                  {errorCount} field{errorCount > 1 ? "s" : ""} need
                  {errorCount > 1 ? "" : "s"} attention before you can continue.
                </p>
              )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={stepMotion.initial}
                animate={stepMotion.animate}
                exit={stepMotion.exit}
                transition={stepMotion.transition}
                className="min-w-0"
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>

            {step < CONFIRMATION_STEP && (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="btn-secondary justify-center"
                  onClick={goBack}
                  disabled={step === 0 || submitting}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>

                <button type="submit" className="btn-primary justify-center" disabled={submitting}>
                  {step === LAST_FORM_STEP ? (
                    submitting ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                        Recording…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" aria-hidden />
                        Submit request
                      </>
                    )
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </GlassCard>
      </div>
    </section>
  );
}
