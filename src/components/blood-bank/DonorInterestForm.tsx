import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  CircleAlert,
  CircleCheckBig,
  ClipboardCheck,
  Copy,
  Info,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  bloodGroups,
  contactMethods,
  indianStates,
  type BloodGroup,
  type ContactMethod,
} from "@/data/bloodGroups";
import { cn } from "@/lib/cn";
import { absoluteTime } from "@/lib/blood/presentation";
import { BloodApiError, bloodApi } from "@/services/blood/api";
import type { DonorRegistrationResult, DonorSummary } from "@/services/blood/types";

type IndianState = (typeof indianStates)[number];

type Values = {
  fullName: string;
  phone: string;
  email: string;
  bloodGroup: BloodGroup | "";
  state: IndianState | "";
  district: string;
  city: string;
  postalCode: string;
  lastDonationDate: string;
  contactMethod: ContactMethod | "";
  ageConfirmed: boolean;
  weightConfirmed: boolean;
  consentToContact: boolean;
};

type FieldKey = keyof Values;
type Errors = Partial<Record<FieldKey, string>>;

const EMPTY: Values = {
  fullName: "",
  phone: "",
  email: "",
  bloodGroup: "",
  state: "",
  district: "",
  city: "",
  postalCode: "",
  lastDonationDate: "",
  contactMethod: "",
  ageConfirmed: false,
  weightConfirmed: false,
  consentToContact: false,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[6-9]\d{9}$/;

/** Mirrors the `blood_donor_availability` enum on the server. */
const DONOR_AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available to donate",
  recently_donated: "Recently donated",
  temporarily_unavailable: "Temporarily unavailable",
  unknown: "Availability not stated",
};

/** Pure validator — returns one message per invalid field. */
function validate(values: Values): Errors {
  const errors: Errors = {};

  const name = values.fullName.trim();
  if (!name) errors.fullName = "Please enter your full name.";
  else if (name.length < 2) errors.fullName = "Please enter at least 2 characters.";

  const digits = values.phone.replace(/[\s-]/g, "").replace(/^(\+91|0)/, "");
  if (!values.phone.trim()) errors.phone = "Please enter your phone number.";
  else if (!PHONE_PATTERN.test(digits)) errors.phone = "Enter a valid 10-digit Indian mobile number.";

  const email = values.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address, or leave it blank.";

  if (!values.bloodGroup) errors.bloodGroup = "Select your blood group.";
  if (!values.state) errors.state = "Select your state.";
  if (!values.city.trim()) errors.city = "Enter your city or town.";
  else if (values.city.trim().length < 2) errors.city = "Please enter at least 2 characters.";

  if (values.postalCode.trim() && !/^\d{6}$/.test(values.postalCode.trim()))
    errors.postalCode = "A PIN code must be 6 digits.";

  if (values.lastDonationDate) {
    const parsed = new Date(values.lastDonationDate);
    if (Number.isNaN(parsed.getTime())) errors.lastDonationDate = "Enter a valid date.";
    else if (parsed.getTime() > Date.now()) errors.lastDonationDate = "The date cannot be in the future.";
  }

  if (!values.contactMethod) errors.contactMethod = "Choose a preferred contact method.";

  if (!values.ageConfirmed) errors.ageConfirmed = "Please confirm you are between 18 and 65 years old.";
  if (!values.weightConfirmed) errors.weightConfirmed = "Please confirm you weigh at least 50 kg.";
  if (!values.consentToContact) errors.consentToContact = "Please confirm the consent statement to continue.";

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

function OptionalMark() {
  return (
    <span className="ml-1 normal-case tracking-normal text-content-secondary/60">(optional)</span>
  );
}

function CheckLine({
  id,
  name,
  checked,
  onChange,
  error,
  children,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3.5 text-sm leading-relaxed text-content-secondary transition-colors duration-300 ease-smooth hover:border-crimson/40"
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-crimson"
          checked={checked}
          onChange={onChange}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{children}</span>
      </label>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/**
 * Real donor registration. The details are written to the MEDIPAL donor registry
 * through the API; the phone number is stored server-side and never published.
 * MEDIPAL is a coordination directory, not a blood bank, and the confirmation
 * says exactly that.
 */
export function DonorInterestForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DonorRegistrationResult | null>(null);
  const [submitError, setSubmitError] = useState<{ message: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<DonorSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryKey, setSummaryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    bloodApi
      .donorSummary(undefined, controller.signal)
      .then((data) => {
        setSummary(data);
        setSummaryError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSummary(null);
        setSummaryError(
          error instanceof BloodApiError
            ? error.message
            : "The donor registry summary could not be loaded.",
        );
      });
    return () => controller.abort();
  }, [summaryKey]);

  const setField = useCallback(<K extends FieldKey>(key: K, value: Values[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const registered = await bloodApi.registerDonor({
        fullName: values.fullName.trim(),
        bloodGroup: values.bloodGroup as BloodGroup,
        phone: values.phone.trim(),
        ...(values.email.trim() ? { email: values.email.trim() } : {}),
        state: values.state,
        ...(values.district.trim() ? { district: values.district.trim() } : {}),
        city: values.city.trim(),
        ...(values.postalCode.trim() ? { postalCode: values.postalCode.trim() } : {}),
        ...(values.lastDonationDate ? { lastDonationDate: values.lastDonationDate } : {}),
        // The registry has no contact-preference column, so the donor's stated
        // preference is recorded in the free-text notes field rather than dropped.
        ...(values.contactMethod
          ? { notes: `Preferred contact method: ${values.contactMethod}` }
          : {}),
        ageConfirmed: values.ageConfirmed,
        weightConfirmed: values.weightConfirmed,
        consentToContact: values.consentToContact,
      });
      setResult(registered);
      setValues(EMPTY);
      setErrors({});
      setSummaryKey((key) => key + 1);
    } catch (error) {
      if (error instanceof BloodApiError) {
        setSubmitError({ message: error.message, code: error.code });
      } else {
        setSubmitError({
          message: "MEDIPAL could not record that registration. Check your connection and try again.",
          code: "UNKNOWN",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setValues(EMPTY);
    setErrors({});
    setResult(null);
    setSubmitError(null);
    setCopied(false);
  };

  const copyReference = () => {
    if (!result) return;
    void navigator.clipboard
      ?.writeText(result.reference)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const registeredTotal = summary?.totalRegisteredDonors ?? 0;
  const hasDonors = (summary?.byGroupAndAvailability.length ?? 0) > 0;

  return (
    <section id="donor-registration" className="section-shell section-pad scroll-mt-28">
      <SectionHeading
        eyebrow="Donor registry"
        title="Register as a blood donor"
        description="Add yourself to the MEDIPAL donor registry so that approved blood banks and blood centres can reach you with your consent. Your mobile number is stored securely and is never published."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:gap-8">
        <GlassCard hairline interactive={false} className="p-7 sm:p-9">
          <p className="mb-7 flex items-start gap-2.5 rounded-2xl border border-line bg-blush-soft px-4 py-3 text-xs leading-relaxed text-content-secondary">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
            Your details are stored in the MEDIPAL donor registry on our servers. A registered
            donor is not blood available on a shelf — eligibility is always confirmed at an
            authorised donation centre.
          </p>

          {result ? (
            <div className="mb-7 rounded-2xl border border-ok/30 bg-ok/[0.06] p-5">
              <div className="flex items-start gap-3">
                <CircleCheckBig className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-semibold text-content-primary">
                    Registration recorded — reference {result.reference}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-content-secondary">
                    {result.bloodGroup} · {DONOR_AVAILABILITY_LABEL[result.availability] ?? result.availability} ·{" "}
                    {result.location.city}, {result.location.state}
                  </p>
                  <p className="mt-1 text-xs text-content-secondary/80">
                    Recorded {absoluteTime(result.registeredAt)}. Contact on file:{" "}
                    <span className="font-medium text-content-primary">{result.contactOnFile}</span>
                  </p>
                  <button
                    type="button"
                    className="btn-secondary mt-3 text-xs"
                    onClick={copyReference}
                    aria-live="polite"
                  >
                    {copied ? <CircleCheckBig className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                    {copied ? "Reference copied" : `Copy ${result.reference}`}
                  </button>
                </div>
              </div>
              <ul className="mt-4 space-y-2 border-t border-ok/20 pt-4 text-xs leading-relaxed text-content-secondary">
                {result.notices.map((notice) => (
                  <li key={notice} className="flex gap-2.5">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
                    {notice}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} noValidate className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="donor-name">
                Full name
                <RequiredMark />
              </label>
              <input
                id="donor-name"
                name="fullName"
                type="text"
                autoComplete="name"
                className="field"
                placeholder="e.g. Ananya Sharma"
                value={values.fullName}
                onChange={(event) => setField("fullName", event.target.value)}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? "donor-name-error" : undefined}
              />
              <FieldError id="donor-name-error" message={errors.fullName} />
            </div>

            <div>
              <label className="field-label" htmlFor="donor-phone">
                Phone number
                <RequiredMark />
              </label>
              <input
                id="donor-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="field"
                placeholder="10-digit mobile number"
                value={values.phone}
                onChange={(event) => setField("phone", event.target.value)}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "donor-phone-error" : undefined}
              />
              <FieldError id="donor-phone-error" message={errors.phone} />
            </div>

            <div>
              <label className="field-label" htmlFor="donor-email">
                Email address
                <OptionalMark />
              </label>
              <input
                id="donor-email"
                name="email"
                type="email"
                autoComplete="email"
                className="field"
                placeholder="you@example.com"
                value={values.email}
                onChange={(event) => setField("email", event.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "donor-email-error" : undefined}
              />
              <FieldError id="donor-email-error" message={errors.email} />
            </div>

            <div>
              <label className="field-label" htmlFor="donor-blood-group">
                Blood group
                <RequiredMark />
              </label>
              <select
                id="donor-blood-group"
                name="bloodGroup"
                className="field"
                value={values.bloodGroup}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setField("bloodGroup", event.target.value as BloodGroup | "")
                }
                aria-invalid={Boolean(errors.bloodGroup)}
                aria-describedby={errors.bloodGroup ? "donor-blood-group-error" : undefined}
              >
                <option value="">Select a blood group</option>
                {bloodGroups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <FieldError id="donor-blood-group-error" message={errors.bloodGroup} />
            </div>

            <div>
              <label className="field-label" htmlFor="donor-contact-method">
                Preferred contact method
                <RequiredMark />
              </label>
              <select
                id="donor-contact-method"
                name="contactMethod"
                className="field"
                value={values.contactMethod}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setField("contactMethod", event.target.value as ContactMethod | "")
                }
                aria-invalid={Boolean(errors.contactMethod)}
                aria-describedby={errors.contactMethod ? "donor-contact-method-error" : undefined}
              >
                <option value="">Select a method</option>
                {contactMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <FieldError id="donor-contact-method-error" message={errors.contactMethod} />
            </div>

            <div>
              <label className="field-label" htmlFor="donor-state">
                State
                <RequiredMark />
              </label>
              <select
                id="donor-state"
                name="state"
                className="field"
                value={values.state}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setField("state", event.target.value as IndianState | "")
                }
                aria-invalid={Boolean(errors.state)}
                aria-describedby={errors.state ? "donor-state-error" : undefined}
              >
                <option value="">Select a state</option>
                {indianStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <FieldError id="donor-state-error" message={errors.state} />
            </div>

            <div>
              <label className="field-label" htmlFor="donor-district">
                District
                <OptionalMark />
              </label>
              <input
                id="donor-district"
                name="district"
                type="text"
                autoComplete="address-level2"
                className="field"
                placeholder="e.g. Pune"
                value={values.district}
                onChange={(event) => setField("district", event.target.value)}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="donor-city">
                City or town
                <RequiredMark />
              </label>
              <input
                id="donor-city"
                name="city"
                type="text"
                autoComplete="address-level3"
                className="field"
                placeholder="e.g. Pune"
                value={values.city}
                onChange={(event) => setField("city", event.target.value)}
                aria-invalid={Boolean(errors.city)}
                aria-describedby={errors.city ? "donor-city-error" : undefined}
              />
              <FieldError id="donor-city-error" message={errors.city} />
            </div>

            <div>
              <label className="field-label" htmlFor="donor-pin">
                PIN code
                <OptionalMark />
              </label>
              <input
                id="donor-pin"
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
                aria-describedby={errors.postalCode ? "donor-pin-error" : undefined}
              />
              <FieldError id="donor-pin-error" message={errors.postalCode} />
            </div>

            <div>
              <label className="field-label" htmlFor="donor-last-donation">
                Last donation date
                <OptionalMark />
              </label>
              <input
                id="donor-last-donation"
                name="lastDonationDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                className="field"
                value={values.lastDonationDate}
                onChange={(event) => setField("lastDonationDate", event.target.value)}
                aria-invalid={Boolean(errors.lastDonationDate)}
                aria-describedby={errors.lastDonationDate ? "donor-last-donation-error" : undefined}
              />
              <FieldError id="donor-last-donation-error" message={errors.lastDonationDate} />
              <p className="mt-2 text-xs leading-relaxed text-content-secondary/80">
                A donation within the last 90 days is recorded as recently donated.
              </p>
            </div>

            <div className="grid gap-4 sm:col-span-2">
              <CheckLine
                id="donor-age"
                name="ageConfirmed"
                checked={values.ageConfirmed}
                onChange={(event) => setField("ageConfirmed", event.target.checked)}
                error={errors.ageConfirmed}
              >
                I confirm that I am between 18 and 65 years old.
              </CheckLine>

              <CheckLine
                id="donor-weight"
                name="weightConfirmed"
                checked={values.weightConfirmed}
                onChange={(event) => setField("weightConfirmed", event.target.checked)}
                error={errors.weightConfirmed}
              >
                I confirm that I weigh at least 50 kg.
              </CheckLine>

              <CheckLine
                id="donor-consent"
                name="consentToContact"
                checked={values.consentToContact}
                onChange={(event) => setField("consentToContact", event.target.checked)}
                error={errors.consentToContact}
              >
                I consent to MEDIPAL storing these details in its donor registry and sharing my
                contact details with approved blood banks and blood centres that are looking for my
                blood group. I understand MEDIPAL does not reserve blood, does not dispatch help and
                is not an emergency service.
              </CheckLine>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                    Submitting…
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="h-4 w-4" aria-hidden />
                    Submit Registration
                  </>
                )}
              </button>
              <button type="button" className="btn-secondary" onClick={handleClear} disabled={submitting}>
                Clear Form
              </button>
            </div>

            <div className="sm:col-span-2" aria-live="polite">
              {submitError ? (
                <div className="flex items-start gap-2.5 rounded-2xl border border-crimson/40 bg-crimson/[0.06] px-4 py-3.5">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-content-primary">
                      The registration could not be recorded
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
          </form>
        </GlassCard>

        <div className="grid content-start gap-6">
          <GlassCard className="p-7 sm:p-9">
            <p className="eyebrow">Registry</p>
            <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em] text-content-primary">
              Who has registered with MEDIPAL
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-content-secondary/80">
              Aggregate counts only — no names, no numbers and no addresses are shown.
            </p>

            <div className="mt-5 rounded-2xl border border-line bg-blush-soft px-4 py-4">
              {summaryError ? (
                <p className="flex items-start gap-2.5 text-sm leading-relaxed text-content-secondary">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
                  {summaryError}
                </p>
              ) : summary === null ? (
                <p className="flex items-center gap-2.5 text-sm text-content-secondary">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  Loading registry summary…
                </p>
              ) : (
                <>
                  <p className="font-display text-3xl font-semibold tracking-[-0.02em] text-content-primary">
                    {registeredTotal}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-content-secondary">
                    Registered donors
                  </p>
                </>
              )}
            </div>

            {summary && hasDonors ? (
              <ul className="mt-5 space-y-2 text-sm text-content-secondary">
                {summary.byGroupAndAvailability.map((row) => (
                  <li
                    key={`${row.bloodGroup}-${row.availability}`}
                    className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-b-0"
                  >
                    <span className="font-medium text-content-primary">{row.bloodGroup}</span>
                    <span className="text-xs">
                      {DONOR_AVAILABILITY_LABEL[row.availability] ?? row.availability}
                    </span>
                    <span className="tabular-nums font-medium text-content-primary">{row.donors}</span>
                  </li>
                ))}
              </ul>
            ) : summary && !hasDonors ? (
              <p className="mt-5 text-sm leading-relaxed text-content-secondary">
                No donors have registered yet, so there is nothing to show. MEDIPAL does not fill
                this space with example records.
              </p>
            ) : null}

            {summary ? (
              <p className="mt-5 flex items-start gap-2.5 border-t border-line pt-4 text-xs leading-relaxed text-content-secondary/80">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crimson" aria-hidden />
                {summary.notice}
              </p>
            ) : null}
          </GlassCard>

          <GlassCard className="flex flex-col justify-between p-7 sm:p-9">
            <div>
              <p className="eyebrow">Good to know</p>
              <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em] text-content-primary">
                What this form is — and is not
              </h3>
              <ul className="mt-6 space-y-4 text-sm leading-relaxed text-content-secondary">
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-crimson" />
                  It creates a real record in the MEDIPAL donor registry.
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-crimson" />
                  It does not reserve blood, notify a blood bank automatically, or send help.
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-crimson" />
                  Eligibility and suitability are always confirmed by qualified healthcare
                  professionals at an authorised donation centre.
                </li>
              </ul>
            </div>
            <p className={cn("mt-8 border-t border-line pt-5 text-xs leading-relaxed text-content-secondary/80")}>
              For real donation enquiries, always contact an authorised blood bank or hospital directly.
            </p>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}
