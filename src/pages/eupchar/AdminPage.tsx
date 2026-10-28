/**
 * E-UPCHAR — price administration console (spec §Issue-3F).
 *
 * A browser role picker is not access control, so this screen holds no local
 * "am I an admin?" flag. Every read and write goes to MEDIPAL's server, which
 * checks the platform-admin key (`EUPCHAR_ADMIN_KEY`) or a gateway-verified
 * `admin` role before answering, and writes an audit row for every change.
 *
 * Two rules this screen keeps:
 *
 *  - the key lives in React state for this tab only — never in localStorage,
 *    sessionStorage, the URL or a log;
 *  - an amount can only be recorded together with the source it came from, that
 *    source's URL, its type and the date it was checked, so no hospital ever
 *    shows a figure MEDIPAL cannot attribute.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice, EuSectionTitle } from "@/components/eupchar/ui";
import { cn } from "@/lib/cn";
import { formatPaise } from "@/lib/eupchar/format";
import { EUpcharApiError, eupcharApi, type AdminPriceInput } from "@/services/eupchar/api";
import { verifiedHospitalEntities } from "@/data/eupchar/directory";
import { PRICE_RESEARCH_CHECKED_ON, priceResearchQueue } from "@/data/eupchar/publishedPrices";
import { services } from "@/data/eupchar/serviceCatalog";
import type {
  AdminAuditEntry,
  AdminPriceCounts,
  AdminPriceRecord,
  AdminSession,
  PriceVerificationStatus,
} from "@/types/eupchar";

/* ------------------------------------------------------------------ */
/* Honest state vocabulary                                             */
/* ------------------------------------------------------------------ */

/** The states an administrator may record. `practice` is never one of them. */
const ADMIN_STATUSES: readonly PriceVerificationStatus[] = [
  "verified",
  "published",
  "free_programme",
  "awaiting_confirmation",
  "unverified",
];

/** Only these three may carry an amount. */
const AMOUNT_STATUSES: readonly PriceVerificationStatus[] = [
  "verified",
  "published",
  "free_programme",
];

const STATUS_LABEL: Record<string, string> = {
  verified: "Provider confirmed",
  published: "Published price",
  free_programme: "Free under applicable programme",
  awaiting_confirmation: "Price not confirmed",
  unverified: "No price available",
};

const SOURCE_TYPES = ["hospital", "official_online", "verified_third_party", "government_programme"] as const;

type ConsoleError = { message: string; code: string };

function describe(error: unknown): ConsoleError {
  if (error instanceof EUpcharApiError) return { message: error.message, code: error.code };
  if (error instanceof DOMException && error.name === "AbortError") {
    return { message: "The request was cancelled before it finished.", code: "ABORTED" };
  }
  if (error instanceof Error) return { message: error.message, code: "UNREACHABLE" };
  return { message: "Something went wrong. Please try again.", code: "UNKNOWN" };
}

/* ------------------------------------------------------------------ */
/* Route entry                                                         */
/* ------------------------------------------------------------------ */

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);

  return (
    <EuShell wide>
      <EuPageHeader
        eyebrow="E-UPCHAR · Administration"
        title="Service price administration"
        description="Record, correct and retire hospital prices with their source. Every amount needs the provider it belongs to, the official URL it was read from, and the date it was checked. Access requires the platform-admin key configured on MEDIPAL's server."
        breadcrumb={[{ label: "E-UPCHAR", to: "/e-upchar" }, { label: "Administration" }]}
      />

      {adminKey ? (
        <AdminWorkspace adminKey={adminKey} onSignOut={() => setAdminKey(null)} />
      ) : (
        <AdminGate onAuthed={setAdminKey} />
      )}
    </EuShell>
  );
}

/* ------------------------------------------------------------------ */
/* Sign-in gate                                                        */
/* ------------------------------------------------------------------ */

function AdminGate({ onAuthed }: { onAuthed: (key: string) => void }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionError, setSessionError] = useState<ConsoleError | null>(null);
  const [key, setKey] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    eupcharApi
      .adminSession()
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch((error) => {
        if (!cancelled) setSessionError(describe(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (sessionError) {
    return (
      <EuNotice tone="error" title="The E-UPCHAR backend could not be reached">
        {sessionError.message} <span className="ml-1 font-mono text-[0.7rem]">{sessionError.code}</span>
      </EuNotice>
    );
  }
  if (!session) {
    return (
      <EuCard className="flex items-center gap-3 p-6 text-sm text-eu-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        Checking whether the administration console is configured…
      </EuCard>
    );
  }

  const configured = session.adminKeyConfigured;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = key.trim();
    if (value.length < 8) {
      setFieldError("The platform-admin key is at least 8 characters long.");
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      // The key is validated by the server, not by this screen.
      await eupcharApi.listAdminPrices(value);
      onAuthed(value);
    } catch (error) {
      setFieldError(describe(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <EuCard className="p-6 sm:p-7">
        <EuSectionTitle
          title="Sign in to price administration"
          description="Paste the platform-admin key. It is sent only to MEDIPAL's own server and kept in this tab's memory."
        />
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="eu-label">Platform-admin key</span>
            <input
              type="password"
              className="eu-field font-mono"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={configured ? "Paste the admin key" : "Not configured on this server"}
              disabled={!configured}
              aria-invalid={Boolean(fieldError)}
            />
          </label>
          {fieldError && (
            <p className="eu-field-error" role="alert">
              {fieldError}
            </p>
          )}
          <button
            type="submit"
            disabled={!configured || busy}
            className="eu-btn eu-btn-primary w-full justify-center gap-2"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
            Open console
          </button>
        </form>
      </EuCard>

      <div className="space-y-4">
        {configured ? (
          <EuNotice tone="info" title="What this console can do">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Record a price for one service at one hospital, with its source URL and the date it was checked.</li>
              <li>Mark a price "not confirmed" so it is never shown or charged until the provider confirms it.</li>
              <li>Flag a recorded source as stale, correct an amount, or remove a price that is wrong.</li>
              <li>Review everything awaiting confirmation and read the audit trail of every change.</li>
            </ul>
          </EuNotice>
        ) : (
          <EuNotice tone="warn" title="Price administration is not configured">
            {session.message}
          </EuNotice>
        )}
        <EuNotice tone="info" title="Nothing is invented here">
          This console stores only amounts a named source publishes. It never averages prices, never copies one
          hospital's charge onto another, and never shows <span className="font-mono">₹0</span> for an unknown price.
        </EuNotice>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

function AdminWorkspace({ adminKey, onSignOut }: { adminKey: string; onSignOut: () => void }) {
  const [prices, setPrices] = useState<AdminPriceRecord[] | null>(null);
  const [counts, setCounts] = useState<AdminPriceCounts | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[] | null>(null);
  const [error, setError] = useState<ConsoleError | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [list, log] = await Promise.all([
        eupcharApi.listAdminPrices(adminKey),
        eupcharApi.listAdminAudit(adminKey),
      ]);
      setPrices(list.prices);
      setCounts(list.counts);
      setAudit(log.entries);
    } catch (caught) {
      setError(describe(caught));
      setPrices(null);
    }
  }, [adminKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(task: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ tone: "ok", message: await task() });
      await refresh();
    } catch (caught) {
      const described = describe(caught);
      setNotice({ tone: "error", message: `${described.message} (${described.code})` });
    } finally {
      setBusy(false);
    }
  }

  const pending = (prices ?? []).filter(
    (price) => price.verificationStatus === "awaiting_confirmation" || price.staleDetectedOn !== null,
  );

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-2">
        <EuBadge tone="ok">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          Signed in
        </EuBadge>
        <button type="button" onClick={() => void refresh()} className="eu-btn eu-btn-secondary gap-1.5 px-3 py-2 text-[0.78rem]">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Refresh
        </button>
        <button type="button" onClick={onSignOut} className="eu-btn eu-btn-secondary gap-1.5 px-3 py-2 text-[0.78rem]">
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </button>
        <Link to="/e-upchar/hospitals" className="eu-btn-quiet px-2 py-2 text-[0.78rem] hover:underline">
          View the patient-facing directory
        </Link>
      </div>

      {notice && (
        <EuNotice tone={notice.tone === "error" ? "error" : "info"}>{notice.message}</EuNotice>
      )}

      {error ? (
        <EuNotice
          tone="error"
          title="The administration API did not answer"
          action={
            <button type="button" onClick={() => void refresh()} className="eu-btn eu-btn-secondary gap-2 px-3 py-2 text-[0.78rem]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </button>
          }
        >
          {error.message} <span className="ml-1 font-mono text-[0.7rem]">{error.code}</span>
        </EuNotice>
      ) : (
        <>
          <RecordedCounts counts={counts} />

          <PriceForm busy={busy} onSubmit={(input, label) => run(async () => {
            await eupcharApi.saveAdminPrice(adminKey, input);
            return label;
          })} />

          <section>
            <EuSectionTitle
              title="Recorded prices"
              description="Every price MEDIPAL holds, with the source it came from. Nothing here is a practice placeholder."
            />
            <div className="mt-4">
              <RecordedPrices
                prices={prices}
                busy={busy}
                onFlagStale={(price) =>
                  run(async () => {
                    await eupcharApi.markAdminPriceStale(adminKey, {
                      hospitalId: price.hospitalId,
                      serviceId: price.serviceId,
                      statusNote: "Flagged for re-checking by an administrator.",
                    });
                    return `Flagged ${price.serviceName ?? price.serviceId} at ${price.hospitalName ?? price.hospitalId} for re-checking.`;
                  })
                }
                onRemove={(price) =>
                  run(async () => {
                    await eupcharApi.removeAdminPrice(adminKey, {
                      hospitalId: price.hospitalId,
                      serviceId: price.serviceId,
                      reason: "Removed by an administrator from the price console.",
                    });
                    return `Removed the price for ${price.serviceName ?? price.serviceId} at ${price.hospitalName ?? price.hospitalId}. The removal is in the audit trail.`;
                  })
                }
              />
            </div>
          </section>

          <section>
            <EuSectionTitle
              title="Pending review"
              description="Prices that are not confirmed, or whose source was flagged stale. None of these is shown to a patient as a chargeable amount."
            />
            <div className="mt-4">
              {pending.length === 0 ? (
                <EuEmptyState
                  icon={ClipboardList}
                  title="Nothing is awaiting review"
                  description="No recorded price is unconfirmed and no source is flagged stale."
                />
              ) : (
                <ul className="space-y-3">
                  {pending.map((price) => (
                    <li key={price.id}>
                      <EuCard className="p-4">
                        <PriceRowHeader price={price} />
                        {price.statusNote && <p className="mt-2 text-[0.78rem] text-eu-muted">{price.statusNote}</p>}
                      </EuCard>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <ResearchQueue />

          <section>
            <EuSectionTitle
              title="Audit trail"
              description="Every administration action MEDIPAL recorded, newest first."
            />
            <div className="mt-4">
              {audit === null ? (
                <EuCard className="flex items-center gap-3 p-6 text-sm text-eu-muted">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  Loading the audit trail…
                </EuCard>
              ) : audit.length === 0 ? (
                <EuEmptyState icon={ScrollText} title="No administration actions recorded yet" />
              ) : (
                <ul className="space-y-2">
                  {audit.map((entry) => (
                    <li key={entry.id}>
                      <EuCard className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3.5 text-[0.78rem]">
                        <span className="font-semibold text-eu-text">{entry.action}</span>
                        <span className="text-eu-muted">{entry.entity}</span>
                        <span className="font-mono text-[0.7rem] text-eu-muted">{entry.entityId}</span>
                        <span className="ml-auto text-eu-muted">{new Date(entry.createdAt).toLocaleString()}</span>
                        <span className="w-full font-mono text-[0.68rem] text-eu-muted">
                          {JSON.stringify(entry.meta)}
                        </span>
                      </EuCard>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Counts                                                             */
/* ------------------------------------------------------------------ */

function RecordedCounts({ counts }: { counts: AdminPriceCounts | null }) {
  if (!counts) return null;
  const items: Array<{ label: string; value: number; tone: "ok" | "neutral" | "warn" }> = [
    { label: "Provider confirmed", value: counts.verified, tone: "ok" },
    { label: "Published", value: counts.published, tone: "neutral" },
    { label: "Free programme", value: counts.free_programme, tone: "ok" },
    { label: "Not confirmed", value: counts.awaiting_confirmation, tone: "warn" },
    { label: "No price", value: counts.unverified, tone: "warn" },
    { label: "Stale source", value: counts.stale, tone: "warn" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <EuCard key={item.label} className="p-4">
          <p className="text-xl font-semibold text-eu-text">{item.value}</p>
          <p className="mt-0.5 text-[0.72rem] font-medium text-eu-muted">{item.label}</p>
        </EuCard>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Record / correct a price                                            */
/* ------------------------------------------------------------------ */

type PriceFormState = {
  hospitalId: string;
  serviceId: string;
  verificationStatus: PriceVerificationStatus;
  amountRupees: string;
  taxesRupees: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: string;
  lastVerifiedOn: string;
  conditions: string;
  statusNote: string;
};

const EMPTY_FORM: PriceFormState = {
  hospitalId: "",
  serviceId: "",
  verificationStatus: "published",
  amountRupees: "",
  taxesRupees: "",
  sourceName: "",
  sourceUrl: "",
  sourceType: "hospital",
  lastVerifiedOn: "",
  conditions: "",
  statusNote: "",
};

/** Rupees typed by an operator, converted to the integer paise MEDIPAL stores. */
function toPaise(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function PriceForm({ busy, onSubmit }: { busy: boolean; onSubmit: (input: AdminPriceInput, label: string) => void }) {
  const [form, setForm] = useState<PriceFormState>(EMPTY_FORM);
  const carriesAmount = AMOUNT_STATUSES.includes(form.verificationStatus);
  const isFree = form.verificationStatus === "free_programme";
  const [validation, setValidation] = useState<string | null>(null);

  function patch(next: Partial<PriceFormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation(null);

    if (!form.hospitalId.trim() || !form.serviceId.trim()) {
      setValidation("Choose the hospital and the service this price belongs to.");
      return;
    }
    let amountPaise: number | null = null;
    if (carriesAmount) {
      amountPaise = isFree ? 0 : toPaise(form.amountRupees);
      if (amountPaise === null) {
        setValidation("Enter the amount in rupees, for example 600 or 600.50.");
        return;
      }
      if (!form.sourceName.trim() || !form.sourceUrl.trim()) {
        setValidation("A priced record needs the source name and its official URL.");
        return;
      }
      if (!form.lastVerifiedOn) {
        setValidation("Record the date the source was checked.");
        return;
      }
    }
    const taxes = toPaise(form.taxesRupees);

    onSubmit(
      {
        hospitalId: form.hospitalId.trim(),
        serviceId: form.serviceId.trim(),
        verificationStatus: form.verificationStatus,
        finalPayablePaise: amountPaise,
        taxesAndFeesPaise: taxes,
        sourceName: form.sourceName.trim() || null,
        sourceUrl: form.sourceUrl.trim() || null,
        sourceType: form.sourceType,
        lastVerifiedOn: form.lastVerifiedOn || null,
        conditions: form.conditions.trim() || null,
        statusNote: form.statusNote.trim() || null,
      },
      `Saved "${STATUS_LABEL[form.verificationStatus]}" for ${form.serviceId} at ${form.hospitalId}.`,
    );
  }

  return (
    <EuCard className="p-6 sm:p-7">
      <EuSectionTitle
        title="Record or correct a price"
        description="Saving replaces any existing record for the same hospital and service. The previous values stay in the audit trail."
      />
      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="eu-label">Hospital ID</span>
          <input
            className="eu-field font-mono"
            list="eupchar-hospital-ids"
            value={form.hospitalId}
            onChange={(event) => patch({ hospitalId: event.target.value })}
            placeholder="HOSP10G06690"
          />
          <datalist id="eupchar-hospital-ids">
            {verifiedHospitalEntities.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {hospital.name}
              </option>
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className="eu-label">Service ID</span>
          <input
            className="eu-field font-mono"
            list="eupchar-service-ids"
            value={form.serviceId}
            onChange={(event) => patch({ serviceId: event.target.value })}
            placeholder="xray-chest"
          />
          <datalist id="eupchar-service-ids">
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className="eu-label">Price state</span>
          <select
            className="eu-field"
            value={form.verificationStatus}
            onChange={(event) => patch({ verificationStatus: event.target.value as PriceVerificationStatus })}
          >
            {ADMIN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="eu-label">Amount (₹)</span>
          <input
            className="eu-field"
            inputMode="decimal"
            value={carriesAmount && !isFree ? form.amountRupees : ""}
            onChange={(event) => patch({ amountRupees: event.target.value })}
            disabled={!carriesAmount || isFree}
            placeholder={carriesAmount ? "0" : "Not applicable for this state"}
          />
          <span className="mt-1 block text-[0.72rem] leading-relaxed text-eu-muted">
            {isFree
              ? "A covered programme is recorded as ₹0 and shown as “Free under applicable programme”."
              : carriesAmount
                ? "The exact figure the source publishes. Stored as integer paise."
                : "This state records a fact, not an amount, so no figure is stored or displayed."}
          </span>
        </label>

        <label className="block">
          <span className="eu-label">Source name</span>
          <input
            className="eu-field"
            value={form.sourceName}
            onChange={(event) => patch({ sourceName: event.target.value })}
            placeholder="IGIMS Patna — Rate List of Various Services"
          />
        </label>

        <label className="block">
          <span className="eu-label">Source URL</span>
          <input
            className="eu-field"
            value={form.sourceUrl}
            onChange={(event) => patch({ sourceUrl: event.target.value })}
            placeholder="https://…"
          />
        </label>

        <label className="block">
          <span className="eu-label">Source type</span>
          <select
            className="eu-field"
            value={form.sourceType}
            onChange={(event) => patch({ sourceType: event.target.value })}
          >
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="eu-label">Source checked on</span>
          <input
            type="date"
            className="eu-field"
            value={form.lastVerifiedOn}
            onChange={(event) => patch({ lastVerifiedOn: event.target.value })}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="eu-label">Conditions, eligibility and exclusions</span>
          <textarea
            className="eu-field min-h-[4.5rem]"
            value={form.conditions}
            onChange={(event) => patch({ conditions: event.target.value })}
            placeholder="e.g. General Ward rate. Effective from June 2016 — the amount is published but old."
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="eu-label">Internal status note</span>
          <input
            className="eu-field"
            value={form.statusNote}
            onChange={(event) => patch({ statusNote: event.target.value })}
            placeholder="Shown only in this console, for example who asked for the re-check."
          />
        </label>

        {validation && (
          <p className="eu-field-error sm:col-span-2" role="alert">
            {validation}
          </p>
        )}

        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className="eu-btn eu-btn-primary gap-2 px-4 py-2.5">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            Save price record
          </button>
        </div>
      </form>
    </EuCard>
  );
}

/* ------------------------------------------------------------------ */
/* Recorded prices                                                     */
/* ------------------------------------------------------------------ */

function PriceRowHeader({ price }: { price: AdminPriceRecord }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-eu-text">
          {price.serviceName ?? price.serviceId}
          <span className="ml-2 font-mono text-[0.7rem] font-normal text-eu-muted">{price.serviceId}</span>
        </p>
        <p className="mt-0.5 text-[0.78rem] text-eu-muted">
          {price.hospitalName ?? price.hospitalId}
          <span className="ml-2 font-mono text-[0.68rem]">{price.hospitalId}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <EuBadge tone={price.verificationStatus === "verified" ? "ok" : price.verificationStatus === "awaiting_confirmation" ? "warn" : "neutral"}>
          {STATUS_LABEL[price.verificationStatus] ?? price.verificationStatus}
        </EuBadge>
        {price.staleDetectedOn && (
          <EuBadge tone="warn">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Stale
          </EuBadge>
        )}
      </div>
    </div>
  );
}

function RecordedPrices({
  prices,
  busy,
  onFlagStale,
  onRemove,
}: {
  prices: AdminPriceRecord[] | null;
  busy: boolean;
  onFlagStale: (price: AdminPriceRecord) => void;
  onRemove: (price: AdminPriceRecord) => void;
}) {
  if (prices === null) {
    return (
      <EuCard className="flex items-center gap-3 p-6 text-sm text-eu-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        Loading recorded prices…
      </EuCard>
    );
  }
  if (prices.length === 0) {
    return (
      <EuEmptyState
        title="No price is recorded yet"
        description="MEDIPAL stores no price until an administrator records one with its source. Import the hospital and service into E-UPCHAR first, then record the amount a named source publishes."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {prices.map((price) => (
        <li key={price.id}>
          <EuCard className="p-4">
            <PriceRowHeader price={price} />
            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.78rem] text-eu-muted">
              <span className="font-semibold text-eu-text">
                {price.verificationStatus === "free_programme"
                  ? "Free under applicable programme"
                  : formatPaise(price.finalPayablePaise) ?? "No amount stored"}
              </span>
              {price.sourceName && (
                <span>
                  Source:{" "}
                  {price.sourceUrl ? (
                    <a
                      href={price.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-eu-red-deep underline-offset-2 hover:underline"
                    >
                      {price.sourceName}
                    </a>
                  ) : (
                    price.sourceName
                  )}
                </span>
              )}
              {price.lastVerifiedOn && <span>checked {price.lastVerifiedOn}</span>}
              {price.staleDetectedOn && <span>flagged stale {price.staleDetectedOn}</span>}
            </div>
            {price.conditions && <p className="mt-2 text-[0.75rem] leading-relaxed text-eu-muted">{price.conditions}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onFlagStale(price)}
                className="eu-btn eu-btn-secondary gap-1.5 px-3 py-1.5 text-[0.72rem]"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Flag source stale
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(price)}
                className="eu-btn eu-btn-secondary gap-1.5 px-3 py-1.5 text-[0.72rem]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove price
              </button>
            </div>
          </EuCard>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Research queue (read-only evidence)                                  */
/* ------------------------------------------------------------------ */

function ResearchQueue() {
  return (
    <section>
      <EuSectionTitle
        title="Price research awaiting a decision"
        description={`Real amounts MEDIPAL found on named sources and could not publish, because the provider is not in the verified hospital directory or the service name does not match MEDIPAL's catalogue exactly. Read on ${PRICE_RESEARCH_CHECKED_ON}.`}
      />
      <div className="mt-4">
        <EuNotice tone="warn" title="This is evidence, not a patient-facing price" className="mb-4">
          Nothing in this list is shown to a patient. An amount only becomes a published price once it is recorded
          against the exact provider above, from that provider's own source.
        </EuNotice>
        <ul className="space-y-3">
          {priceResearchQueue.map((record) => (
            <li key={record.id}>
              <EuCard className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-eu-text">{record.serviceName}</p>
                    <p className="mt-0.5 text-[0.78rem] text-eu-muted">
                      {record.providerName} · {record.category} · {record.unit}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <EuBadge tone={record.inVerifiedDirectory ? "ok" : "neutral"}>
                      {record.inVerifiedDirectory ? "In verified directory" : "Not in directory"}
                    </EuBadge>
                    <span className="text-[0.78rem] font-semibold text-eu-text">
                      {record.amountPaise === null ? "No amount published" : formatPaise(record.amountPaise)}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-[0.75rem] text-eu-muted">
                  <a
                    href={record.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cn("text-eu-red-deep underline-offset-2 hover:underline")}
                  >
                    {record.sourceName}
                  </a>{" "}
                  · {record.sourceType.replace(/_/g, " ")} · checked {record.checkedOn}
                </p>
                {record.conditions && (
                  <p className="mt-2 text-[0.75rem] leading-relaxed text-eu-muted">{record.conditions}</p>
                )}
              </EuCard>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
