import { useState } from "react";
import {
  Building2,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Navigation,
  ArrowRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { API_BASE, MAPS_ENABLED } from "@/services/eupchar/config";
import { bloodApi, BloodApiError } from "@/services/blood/api";
import { FACILITY_CATEGORIES, type FacilityApplicationResult, type FacilityCategory } from "@/services/blood/types";

interface FormState {
  name: string;
  category: FacilityCategory;
  operatingHours: string;
  address: string;
  city: string;
  district: string;
  state: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  licenseNumber: string;
  authorizedRep: string;
  phone: string;
  emergencyHotline: string;
  email: string;
  hasBloodBank: boolean;
  contactConsent: boolean;
}

const EMPTY: FormState = {
  name: "",
  category: "Hospital Blood Bank",
  operatingHours: "",
  address: "",
  city: "",
  district: "",
  state: "Bihar",
  postalCode: "",
  latitude: "",
  longitude: "",
  licenseNumber: "",
  authorizedRep: "",
  phone: "",
  emergencyHotline: "",
  email: "",
  hasBloodBank: true,
  contactConsent: false,
};

type Submit =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; result: FacilityApplicationResult }
  | { status: "error"; message: string; code: string };

const REQUIRED_STEP_1: (keyof FormState)[] = ["name"];
const REQUIRED_STEP_2: (keyof FormState)[] = ["address", "city", "state"];
const REQUIRED_STEP_3: (keyof FormState)[] = ["licenseNumber", "authorizedRep", "phone"];

const LABELS: Partial<Record<keyof FormState, string>> = {
  name: "Official facility legal name",
  address: "Street address",
  city: "City / town",
  state: "State",
  licenseNumber: "Blood bank licence number",
  authorizedRep: "Authorised representative",
  phone: "Facility phone",
};

/**
 * Patna network facility enrollment.
 *
 * This form posts to the real `POST /api/blood/facilities/applications` route,
 * which writes a `pending` facility row and raises a platform-admin review
 * notification. Nothing here claims the facility is live, verified or able to
 * sign in — the server's own notices are surfaced verbatim.
 */
export function LiveRegisterHub() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const [geo, setGeo] = useState<{ status: "idle" | "loading" | "done" | "failed"; label?: string }>(
    { status: "idle" },
  );
  const [submit, setSubmit] = useState<Submit>({ status: "idle" });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function validate(keys: (keyof FormState)[]): boolean {
    const missing = keys.filter((key) => {
      const value = form[key];
      if (typeof value === "boolean") return false;
      return String(value ?? "").trim().length === 0;
    });
    if (missing.length > 0) {
      setErrors(missing.map((key) => `${LABELS[key] ?? key} is required.`));
      return false;
    }
    setErrors([]);
    return true;
  }

  async function locate() {
    if (!MAPS_ENABLED) {
      setGeo({
        status: "failed",
        label:
          "Address search is unavailable because the Geoapify key is not configured on the server. Register the facility with the licence details and MEDIPAL will place it during the on-site audit.",
      });
      return;
    }
    setGeo({ status: "loading" });
    const query = [form.address, form.city, form.district, form.state, form.postalCode, "India"]
      .filter(Boolean)
      .join(", ");
    try {
      const response = await fetch(
        `${API_BASE}/api/geoapify/geocode?text=${encodeURIComponent(query)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) {
        setGeo({
          status: "failed",
          label:
            response.status === 404
              ? "No map match was found for that address. Check the street, locality and PIN code, then try again."
              : `The map service replied with ${response.status}. You can still submit without coordinates.`,
        });
        return;
      }
      const payload = (await response.json()) as {
        latitude?: number;
        longitude?: number;
        formatted?: string;
      };
      if (typeof payload.latitude !== "number" || typeof payload.longitude !== "number") {
        setGeo({ status: "failed", label: "The map service returned no coordinates." });
        return;
      }
      set("latitude", String(payload.latitude));
      set("longitude", String(payload.longitude));
      setGeo({ status: "done", label: payload.formatted ?? query });
    } catch {
      setGeo({
        status: "failed",
        label: "MEDIPAL could not reach the map service. Check your connection and try again.",
      });
    }
  }

  async function onSubmit() {
    if (!form.contactConsent) {
      setErrors(["Confirmation from an authorised representative is required before submitting."]);
      return;
    }
    const latitude = Number.parseFloat(form.latitude);
    const longitude = Number.parseFloat(form.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setErrors([
        "Coordinates are required so the facility can appear on the map. Run the address search on step 2, or enter the latitude and longitude manually.",
      ]);
      return;
    }
    setErrors([]);
    setSubmit({ status: "sending" });
    try {
      const result = await bloodApi.applyAsFacility({
        name: form.name.trim(),
        category: form.category,
        address: form.address.trim(),
        state: form.state.trim(),
        district: form.district.trim() || undefined,
        city: form.city.trim(),
        postalCode: form.postalCode.trim() || undefined,
        latitude,
        longitude,
        licenseNumber: form.licenseNumber.trim(),
        authorizedRep: form.authorizedRep.trim(),
        phone: form.phone.trim(),
        emergencyHotline: form.emergencyHotline.trim() || undefined,
        email: form.email.trim() || undefined,
        operatingHours: form.operatingHours.trim() || undefined,
        hasBloodBank: form.hasBloodBank,
        contactConsent: true,
      });
      setSubmit({ status: "done", result });
    } catch (error) {
      if (error instanceof BloodApiError) {
        setSubmit({
          status: "error",
          message: error.isUnavailable
            ? "The blood bank service is not reachable from this deployment right now. Your details were not stored."
            : error.message,
          code: error.code,
        });
      } else {
        setSubmit({
          status: "error",
          message: "The application could not be submitted. Please try again.",
          code: "UNKNOWN",
        });
      }
    }
  }

  if (submit.status === "done") {
    return (
      <div className="flex flex-col h-full bg-white/40 backdrop-blur-sm p-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-3xl border border-emerald-300 bg-emerald-50/60 p-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden />
              <h2 className="font-display text-xl font-bold text-content-primary">
                Application received
              </h2>
            </div>
            <p className="mt-3 text-sm text-content-secondary">
              Reference <span className="font-semibold text-content-primary">{submit.result.reference}</span>{" "}
              · status <span className="font-semibold text-content-primary">{submit.result.status}</span>{" "}
              · submitted {new Date(submit.result.submittedAt).toLocaleString()}
            </p>
            <ul className="mt-5 space-y-3">
              {submit.result.notices.map((notice) => (
                <li key={notice} className="flex items-start gap-3 text-xs leading-relaxed text-content-secondary">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <span>{notice}</span>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY);
              setGeo({ status: "idle" });
              setSubmit({ status: "idle" });
              setStep(1);
            }}
            className="btn-secondary mt-6"
          >
            Register another facility
          </button>
        </div>
      </div>
    );
  }

  const sending = submit.status === "sending";

  return (
    <div className="flex flex-col h-full bg-white/40 backdrop-blur-sm">
      <div className="border-b border-line bg-white/60 p-8">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-crimson">
          Patna Network Facility Enrollment
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-content-primary">
          Register Hospital Blood Bank or Transfusion Depot
        </h2>
        <p className="mt-2 text-sm text-content-secondary max-w-2xl">
          Hospitals and transfusion centers in Patna, Danapur, and Bihta can apply to coordinate regional
          shortages, manage live inventory, and track cold-chain deliveries. Applications are reviewed by a
          MEDIPAL administrator before any access is granted.
        </p>
      </div>

      <div className="flex-1 p-8">
        <div className="mx-auto max-w-3xl">
          {/* Progress Steps */}
          <div className="mb-10 flex items-center justify-between px-4">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 font-bold text-xs transition-all",
                    step === s
                      ? "border-crimson bg-crimson text-white"
                      : step > s
                        ? "border-crimson bg-crimson/10 text-crimson"
                        : "border-line bg-white text-content-secondary/40",
                  )}
                >
                  {step > s ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : s}
                </div>
                {s < 4 && (
                  <div
                    className={cn("h-[2px] w-12 sm:w-20 mx-2", step > s ? "bg-crimson/30" : "bg-line")}
                  />
                )}
              </div>
            ))}
          </div>

          {errors.length > 0 && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <ul className="space-y-1 text-[0.7rem] leading-relaxed">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Form Sections */}
          <div className="rounded-3xl border border-line bg-white/70 p-8 shadow-sm">
            {step === 1 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <Building2 className="h-5 w-5 text-crimson" aria-hidden />
                  <h3 className="text-[0.7rem] font-bold uppercase tracking-widest text-content-primary">
                    1. Hospital / Blood Center Identification
                  </h3>
                </div>

                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label htmlFor="fac-name" className="text-xs font-bold text-content-primary">
                      Official Facility Legal Name *
                    </label>
                    <input
                      id="fac-name"
                      type="text"
                      value={form.name}
                      onChange={(event) => set("name", event.target.value)}
                      placeholder="e.g. Paras HMRI Hospital Blood Bank"
                      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                    />
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="fac-category" className="text-xs font-bold text-content-primary">
                        Facility Category *
                      </label>
                      <select
                        id="fac-category"
                        value={form.category}
                        onChange={(event) => set("category", event.target.value as FacilityCategory)}
                        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                      >
                        {FACILITY_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="fac-hours" className="text-xs font-bold text-content-primary">
                        Operating Schedule
                      </label>
                      <input
                        id="fac-hours"
                        type="text"
                        value={form.operatingHours}
                        onChange={(event) => set("operatingHours", event.target.value)}
                        placeholder="24/7 Emergency Transfusion Service"
                        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <Navigation className="h-5 w-5 text-crimson" aria-hidden />
                  <h3 className="text-[0.7rem] font-bold uppercase tracking-widest text-content-primary">
                    2. Location &amp; Map Coordinates
                  </h3>
                </div>

                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label htmlFor="fac-address" className="text-xs font-bold text-content-primary">
                      Street Address &amp; Locality *
                    </label>
                    <input
                      id="fac-address"
                      type="text"
                      value={form.address}
                      onChange={(event) => set("address", event.target.value)}
                      placeholder="e.g. Bailey Road, Sheikhpura or Ashok Rajpath"
                      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                    />
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                      <label htmlFor="fac-city" className="text-xs font-bold text-content-primary">
                        City / Town *
                      </label>
                      <input
                        id="fac-city"
                        type="text"
                        value={form.city}
                        onChange={(event) => set("city", event.target.value)}
                        placeholder="e.g. Patna"
                        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="fac-district" className="text-xs font-bold text-content-primary">
                        District
                      </label>
                      <input
                        id="fac-district"
                        type="text"
                        value={form.district}
                        onChange={(event) => set("district", event.target.value)}
                        placeholder="e.g. Patna"
                        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="fac-state" className="text-xs font-bold text-content-primary">
                        State *
                      </label>
                      <input
                        id="fac-state"
                        type="text"
                        value={form.state}
                        onChange={(event) => set("state", event.target.value)}
                        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="fac-pin" className="text-xs font-bold text-content-primary">
                        PIN Code
                      </label>
                      <input
                        id="fac-pin"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={form.postalCode}
                        onChange={(event) => set("postalCode", event.target.value)}
                        placeholder="8000XX"
                        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => void locate()}
                      disabled={geo.status === "loading" || sending}
                      className="btn-secondary gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {geo.status === "loading" ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <MapPin className="h-4 w-4" aria-hidden />
                      )}
                      {geo.status === "loading" ? "Searching address…" : "Search address for coordinates"}
                    </button>

                    {geo.status === "done" && (
                      <p className="text-[0.7rem] leading-relaxed text-content-secondary">
                        Approximate match: <span className="font-semibold text-content-primary">{geo.label}</span>{" "}
                        · {form.latitude}, {form.longitude}
                      </p>
                    )}
                    {geo.status === "failed" && (
                      <p className="text-[0.7rem] leading-relaxed text-amber-700">{geo.label}</p>
                    )}

                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="fac-lat" className="text-xs font-bold text-content-primary">
                          Latitude *
                        </label>
                        <input
                          id="fac-lat"
                          type="text"
                          inputMode="decimal"
                          value={form.latitude}
                          onChange={(event) => set("latitude", event.target.value)}
                          placeholder="e.g. 25.5941"
                          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="fac-lng" className="text-xs font-bold text-content-primary">
                          Longitude *
                        </label>
                        <input
                          id="fac-lng"
                          type="text"
                          inputMode="decimal"
                          value={form.longitude}
                          onChange={(event) => set("longitude", event.target.value)}
                          placeholder="e.g. 85.1376"
                          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <ShieldCheck className="h-5 w-5 text-crimson" aria-hidden />
                  <h3 className="text-[0.7rem] font-bold uppercase tracking-widest text-content-primary">
                    3. Licence &amp; Responsible Contact
                  </h3>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="fac-licence" className="text-xs font-bold text-content-primary">
                      Blood Bank Licence Number *
                    </label>
                    <input
                      id="fac-licence"
                      type="text"
                      value={form.licenseNumber}
                      onChange={(event) => set("licenseNumber", event.target.value)}
                      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="fac-rep" className="text-xs font-bold text-content-primary">
                      Authorised Representative *
                    </label>
                    <input
                      id="fac-rep"
                      type="text"
                      value={form.authorizedRep}
                      onChange={(event) => set("authorizedRep", event.target.value)}
                      placeholder="Name and designation"
                      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="fac-phone" className="text-xs font-bold text-content-primary">
                      Facility Phone *
                    </label>
                    <input
                      id="fac-phone"
                      type="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={(event) => set("phone", event.target.value)}
                      placeholder="10-digit Indian mobile number"
                      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="fac-hotline" className="text-xs font-bold text-content-primary">
                      Emergency Hotline
                    </label>
                    <input
                      id="fac-hotline"
                      type="tel"
                      inputMode="tel"
                      value={form.emergencyHotline}
                      onChange={(event) => set("emergencyHotline", event.target.value)}
                      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label htmlFor="fac-email" className="text-xs font-bold text-content-primary">
                      Contact Email
                    </label>
                    <input
                      id="fac-email"
                      type="email"
                      value={form.email}
                      onChange={(event) => set("email", event.target.value)}
                      className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 text-xs font-medium text-content-secondary">
                  <input
                    type="checkbox"
                    checked={form.hasBloodBank}
                    onChange={(event) => set("hasBloodBank", event.target.checked)}
                    className="h-4 w-4 rounded border-line"
                  />
                  This facility operates an on-site blood bank or transfusion service.
                </label>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <CheckCircle2 className="h-5 w-5 text-crimson" aria-hidden />
                  <h3 className="text-[0.7rem] font-bold uppercase tracking-widest text-content-primary">
                    4. Review &amp; Authorised Confirmation
                  </h3>
                </div>

                <dl className="divide-y divide-line rounded-2xl border border-line bg-white/70">
                  {(
                    [
                      ["Facility", form.name],
                      ["Category", form.category],
                      ["Address", [form.address, form.city, form.district, form.state, form.postalCode].filter(Boolean).join(", ")],
                      ["Coordinates", form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : "Not set"],
                      ["Licence", form.licenseNumber],
                      ["Representative", form.authorizedRep],
                      ["Phone", form.phone],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <dt className="text-[0.65rem] font-bold uppercase tracking-widest text-content-secondary/70">
                        {label}
                      </dt>
                      <dd className="text-xs font-medium text-content-primary sm:text-right">
                        {value || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>

                <label className="flex items-start gap-3 text-xs leading-relaxed text-content-secondary">
                  <input
                    type="checkbox"
                    checked={form.contactConsent}
                    onChange={(event) => set("contactConsent", event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line"
                  />
                  I confirm I am authorised to represent this facility, that the licence details above are
                  accurate, and that MEDIPAL may contact the number provided to verify them.
                </label>

                {submit.status === "error" && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p className="text-[0.7rem] leading-relaxed">
                      {submit.message} <span className="opacity-70">({submit.code})</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Nav Buttons */}
            <div className="mt-10 flex items-center justify-between border-t border-line pt-8">
              <button
                type="button"
                onClick={() => {
                  setErrors([]);
                  setStep((s) => Math.max(1, s - 1));
                }}
                className={cn(
                  "px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-content-secondary transition-colors hover:text-crimson",
                  step === 1 && "invisible",
                )}
              >
                Back
              </button>

              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  if (step === 1 && !validate(REQUIRED_STEP_1)) return;
                  if (step === 2 && !validate(REQUIRED_STEP_2)) return;
                  if (step === 3 && !validate(REQUIRED_STEP_3)) return;
                  if (step === 4) {
                    void onSubmit();
                    return;
                  }
                  setErrors([]);
                  setStep((s) => Math.min(4, s + 1));
                }}
                className="btn-primary group disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Submitting…
                  </>
                ) : (
                  <>
                    {step === 4 ? "Submit Registration" : "Next Section"}
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-8 flex items-start gap-4 rounded-2xl border border-line bg-white/30 p-5">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            <div>
              <p className="text-xs font-bold text-content-primary uppercase tracking-widest">
                Verification Protocol
              </p>
              <p className="mt-1 text-[0.65rem] leading-relaxed text-content-secondary">
                Submitted facilities are reviewed by the MEDIPAL regional administrator. Verification status
                and dashboard access are granted only after physical location audit and license validation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
