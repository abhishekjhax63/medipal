import { useMemo, useRef, useState } from "react";
import { Camera, Check, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { EuNotice } from "@/components/eupchar/ui";
import { maskLast4 } from "@/lib/eupchar/format";
import { createPatient, type PatientInput } from "@/services/eupchar/repository";
import type { MaskedIdentity, Patient, PatientGender, PatientRelation } from "@/types/eupchar";

const GENDER_OPTIONS: readonly { value: PatientGender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "undisclosed", label: "Prefer not to say" },
];

const RELATION_OPTIONS: readonly { value: PatientRelation; label: string }[] = [
  { value: "self", label: "Myself" },
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

type PhotoDraft = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Object URL held in memory for this session only — never persisted. */
  previewUrl: string;
};

type Errors = Partial<Record<"fullName" | "dateOfBirth" | "gender" | "phone" | "email" | "identity", string>>;

function validate(values: {
  fullName: string;
  dateOfBirth: string;
  gender: PatientGender | "";
  phone: string;
  email: string;
  identity: string;
  wantsIdentity: boolean;
  consented: boolean;
}): Errors {
  const errors: Errors = {};
  if (values.fullName.trim().length < 2) errors.fullName = "Enter the patient's full name.";
  if (!values.dateOfBirth) {
    errors.dateOfBirth = "Enter the date of birth.";
  } else {
    const dob = new Date(values.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob.getTime() > Date.now()) {
      errors.dateOfBirth = "Enter a valid date of birth in the past.";
    }
  }
  if (!values.gender) errors.gender = "Select a gender option.";
  const digits = values.phone.replace(/\D/g, "");
  if (digits.length < 10) errors.phone = "Enter a 10-digit mobile number.";
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = "Enter a valid email address, or leave it blank.";
  }
  if (values.wantsIdentity && values.identity) {
    const idDigits = values.identity.replace(/\D/g, "");
    if (idDigits.length !== 12) errors.identity = "Aadhaar numbers have 12 digits.";
    if (!values.consented) errors.identity = "Consent is required before an identity reference is kept.";
  }
  return errors;
}

/**
 * Add-patient form (spec §10, §11).
 *
 * Identity handling: consent is requested before the field is enabled, an
 * alternative ("skip identity") is always offered, and only the last four digits
 * are retained — masked. The full number never reaches storage, a URL or a log,
 * and it is never redisplayed after submission.
 */
export function AddPatientForm({
  onCreated,
  onCancel,
}: {
  onCreated: (patient: Patient) => void;
  onCancel?: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<PatientGender | "">("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<PatientRelation>("self");
  const [address, setAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [wantsIdentity, setWantsIdentity] = useState(false);
  const [consented, setConsented] = useState(false);
  const [identity, setIdentity] = useState("");
  const [photo, setPhoto] = useState<PhotoDraft | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const identityMaskedPreview = useMemo(
    () => (identity.replace(/\D/g, "").length >= 4 ? maskLast4(identity) : null),
    [identity],
  );

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    setPhoto({ fileName: file.name, mimeType: file.type || "image/*", sizeBytes: file.size, previewUrl });
    setUploadProgress(18);
    // A local read-through only. Nothing is uploaded anywhere and no public URL
    // is ever produced — the file stays in this browser session.
    const timer = window.setInterval(() => {
      setUploadProgress((current) => {
        if (current >= 100) {
          window.clearInterval(timer);
          return 100;
        }
        return Math.min(100, current + 22);
      });
    }, 90);
  }

  function removePhoto() {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validate({
      fullName,
      dateOfBirth,
      gender,
      phone,
      email,
      identity,
      wantsIdentity,
      consented,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    // Only the masked reference is constructed here. The raw value is discarded
    // the moment this function returns.
    const identityRef: MaskedIdentity | null =
      wantsIdentity && consented && identity.replace(/\D/g, "").length === 12
        ? { kind: "aadhaar_last4", masked: maskLast4(identity), consentedAt: new Date().toISOString() }
        : null;

    const input: PatientInput = {
      fullName: fullName.trim(),
      dateOfBirth,
      gender: gender as PatientGender,
      phone: phone.replace(/\D/g, ""),
      email: email.trim() || null,
      relationship,
      address: address.trim() || null,
      emergencyContact: emergencyContact.trim() || null,
      identity: identityRef,
    };
    const patient = createPatient(input);
    setIdentity("");
    setSaving(false);
    onCreated(patient);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Photo */}
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-eu-border bg-eu-surface">
          {photo ? (
            <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-eu-muted">
              <Camera className="h-5 w-5" aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="eu-btn eu-btn-secondary cursor-pointer px-3 py-1.5 text-[0.78rem]">
              {photo ? "Replace photo" : "Add photo"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handlePhotoChange}
              />
            </label>
            {photo && (
              <button
                type="button"
                onClick={removePhoto}
                className="eu-btn eu-btn-quiet gap-1.5 px-2.5 py-1.5 text-[0.78rem] text-eu-red-deep"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove
              </button>
            )}
          </div>
          {photo ? (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-eu-surface">
                <div
                  className="h-full rounded-full bg-eu-red transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="mt-1 truncate text-[0.7rem] text-eu-muted">
                {photo.fileName} · {(photo.sizeBytes / 1024).toFixed(0)} KB · kept in this browser
                session only
              </p>
            </div>
          ) : (
            <p className="mt-1 text-[0.7rem] text-eu-muted">
              Optional. The image is read locally for preview and is not uploaded to any public URL.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.fullName} required>
          <input
            className="eu-field"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            aria-invalid={Boolean(errors.fullName)}
          />
        </Field>
        <Field label="Date of birth" error={errors.dateOfBirth} required>
          <input
            type="date"
            className="eu-field"
            value={dateOfBirth}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDateOfBirth(e.target.value)}
            aria-invalid={Boolean(errors.dateOfBirth)}
          />
        </Field>
        <Field label="Gender" error={errors.gender} required>
          <select
            className="eu-field"
            value={gender}
            onChange={(e) => setGender(e.target.value as PatientGender)}
            aria-invalid={Boolean(errors.gender)}
          >
            <option value="">Select…</option>
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Relationship to you" error={undefined}>
          <select
            className="eu-field"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as PatientRelation)}
          >
            {RELATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mobile number" error={errors.phone} required>
          <input
            className="eu-field"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            placeholder="10-digit mobile"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
          />
        </Field>
        <Field label="Email (optional)" error={errors.email}>
          <input
            className="eu-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
          />
        </Field>
        <Field label="Address (optional)">
          <input
            className="eu-field"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="street-address"
          />
        </Field>
        <Field label="Emergency contact (optional)">
          <input
            className="eu-field"
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            placeholder="Name and number"
          />
        </Field>
      </div>

      {/* Identity — consent first (spec §11) */}
      <div className="rounded-2xl border border-eu-border bg-eu-surface p-4">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-eu-red"
            checked={wantsIdentity}
            onChange={(e) => {
              setWantsIdentity(e.target.checked);
              if (!e.target.checked) {
                setIdentity("");
                setConsented(false);
                setErrors((prev) => ({ ...prev, identity: undefined }));
              }
            }}
          />
          <span className="text-sm text-eu-text">
            I want to add an Aadhaar reference for this patient
            <span className="mt-1 block text-[0.75rem] leading-relaxed text-eu-muted">
              Optional. You can continue without it — the hospital can verify identity at the desk.
            </span>
          </span>
        </label>

        {wantsIdentity && (
          <div className="mt-4 space-y-3">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-eu-border bg-eu-bg p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-eu-red"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
              />
              <span className="text-[0.8rem] leading-relaxed text-eu-text">
                I consent to MEDIPAL keeping a masked reference (last 4 digits only) for this
                booking. I understand the full number is never stored, logged, shared, or placed in a
                URL, and that I can delete this patient's data at any time.
              </span>
            </label>
            <Field label="Aadhaar number" error={errors.identity}>
              <input
                className="eu-field"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                inputMode="numeric"
                placeholder="12 digits"
                maxLength={14}
                disabled={!consented}
                aria-invalid={Boolean(errors.identity)}
              />
            </Field>
            {identityMaskedPreview && consented && (
              <p className="flex items-center gap-1.5 text-[0.75rem] text-eu-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-eu-ok" aria-hidden />
                Only this will be kept: <span className="font-medium text-eu-text">{identityMaskedPreview}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <EuNotice tone="info">
        Patient details stay on this device until a hospital or MEDIPAL account connection is
        authorised. Nothing here is sent to a hospital by saving this form.
      </EuNotice>

      <div className="flex flex-wrap items-center gap-2.5">
        <button type="submit" className="eu-btn eu-btn-primary gap-2 px-4 py-2.5" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Save patient
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2.5">
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eu-label">
        {label}
        {required && <span className="ml-1 text-eu-red-deep">*</span>}
      </span>
      {children}
      {error && <span className="eu-field-error">{error}</span>}
    </label>
  );
}
