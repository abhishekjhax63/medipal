/**
 * Blood Bank — Platform Admin Console.
 *
 * The MEDIPAL platform team's screen: review facility applications, issue and
 * revoke facility console credentials, advance a request along its allowed
 * path, read the audit trail and run the platform self-test.
 *
 * Three rules this screen keeps. A credential is shown exactly once, at the
 * moment the server mints it, because the server stores only a hash. The
 * platform-admin key lives in React state for this tab only — never in
 * localStorage, sessionStorage, the URL or a log. And nothing is invented: if
 * the console is not configured it says so, and a failure is rendered as a
 * failure with the server's own message and code.
 */

import { useState, type FormEvent } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice, EuSectionTitle } from "@/components/eupchar/ui";
import {
  ActionFeedback,
  ErrorState,
  Field,
  LoadingCard,
  SecretReveal,
  useAction,
  useResource,
} from "@/components/blood-bank/consoleKit";
import { cn } from "@/lib/cn";
import { FACILITY_STATUS_LABEL, REQUEST_STATUS_LABEL, absoluteTime, relativeTime } from "@/lib/blood/presentation";
import { adminApi } from "@/services/blood/api";
import {
  type AdminFacility,
  type AuditEntry,
  type FacilityStatus,
  type RequestStatus,
  type SelfTestResult,
} from "@/services/blood/types";

/* ------------------------------------------------------------------ */
/* Route entry                                                         */
/* ------------------------------------------------------------------ */

export default function AdminConsolePage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);

  return (
    <EuShell wide>
      <EuPageHeader
        eyebrow="Blood Bank · Platform admin"
        title="Platform admin console"
        description="Review facility applications, issue or revoke console credentials, advance requests, read the audit trail and run the platform self-test. Access requires the MEDIPAL platform-admin key configured on the server."
        breadcrumb={[{ label: "Blood Bank", to: "/" }, { label: "Platform admin" }]}
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
  const session = useResource(() => adminApi.session());
  const [key, setKey] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const action = useAction();

  if (session.state.kind === "loading") {
    return <LoadingCard label="Checking whether the admin console is configured…" />;
  }
  if (session.state.kind === "error") {
    // A backend that cannot be reached is a failure, not "not configured".
    return <ErrorState error={session.state} onRetry={session.reload} />;
  }

  const configured = session.state.data.configured;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = key.trim();
    if (value.length < 8) {
      setFieldError("The platform-admin key is at least 8 characters long.");
      return;
    }
    setFieldError(null);
    void action.run(async () => {
      await adminApi.stats(value);
      onAuthed(value);
      return "Signed in.";
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <EuCard className="p-6 sm:p-7">
        <EuSectionTitle
          title="Sign in to the platform admin"
          description="Paste the platform-admin key. It is sent only to MEDIPAL's own server and kept in this tab's memory."
        />
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field
            label="Platform-admin key"
            hint="Never share it. It lives in this browser tab only and is cleared when you sign out or close the tab."
          >
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
          </Field>
          {fieldError && (
            <p className="eu-field-error" role="alert">
              {fieldError}
            </p>
          )}
          <button
            type="submit"
            disabled={!configured || action.busy}
            className="eu-btn eu-btn-primary w-full justify-center gap-2"
          >
            {action.busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden />
            )}
            Open console
          </button>
          <ActionFeedback tone={action.tone} message={action.message} />
        </form>
      </EuCard>

      <div className="space-y-4">
        {configured ? (
          <EuNotice tone="info" title="What this console can do">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Approve, reject, suspend or return a facility application for further review.</li>
              <li>Issue a new console credential, or revoke one by its hint. A credential is shown once only.</li>
              <li>Advance a request along the transitions the platform allows, with a note recorded against it.</li>
              <li>Read every recorded action in the audit trail and run the platform self-test.</li>
            </ul>
          </EuNotice>
        ) : (
          <EuNotice tone="warn" title="The admin console is not configured">
            {session.state.data.message}
          </EuNotice>
        )}

        <EuNotice tone="info" title="Approval is evidence-based">
          A facility cannot be approved without a licence number on file, and marking it field-verified requires
          an explicit confirmation that the licence was checked on site. Both rules are enforced by the server,
          not by this screen.
        </EuNotice>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "facilities", label: "Facilities" },
  { id: "requests", label: "Requests" },
  { id: "audit", label: "Audit trail" },
  { id: "self-test", label: "Self-test" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function AdminWorkspace({ adminKey, onSignOut }: { adminKey: string; onSignOut: () => void }) {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div>
      <EuCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-eu-border bg-eu-bg text-eu-red-deep">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[0.95rem] font-semibold text-eu-text">Platform administrator</p>
            <p className="text-[0.78rem] text-eu-muted">
              Key held in this tab&apos;s memory only — never stored, never logged.
            </p>
          </div>
        </div>
        <button type="button" onClick={onSignOut} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </button>
      </EuCard>

      <div className="eu-scroll-x mt-5 pb-1">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTab(option.id)}
            aria-pressed={tab === option.id}
            className={cn(
              "eu-chip shrink-0",
              tab === option.id ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep" : "border-eu-border bg-eu-bg text-eu-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "overview" && <StatsTab adminKey={adminKey} />}
        {tab === "facilities" && <FacilitiesTab adminKey={adminKey} />}
        {tab === "requests" && <RequestsTab adminKey={adminKey} />}
        {tab === "audit" && <AuditTab adminKey={adminKey} />}
        {tab === "self-test" && <SelfTestTab adminKey={adminKey} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview — platform statistics                                      */
/* ------------------------------------------------------------------ */

function StatsTab({ adminKey }: { adminKey: string }) {
  const { state, reload } = useResource(() => adminApi.stats(adminKey));

  if (state.kind === "loading") return <LoadingCard label="Loading platform statistics…" />;
  if (state.kind === "error") return <ErrorState error={state} onRetry={reload} />;

  const { stats, generatedAt } = state.data;

  return (
    <EuCard className="p-5">
      <EuSectionTitle
        title="Platform statistics"
        description={`Counted directly from the database at ${absoluteTime(generatedAt)}.`}
        action={
          <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
        }
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Facilities on record" value={stats.facilities_total} />
        <Stat label="Approved facilities" value={stats.facilities_approved} />
        <Stat label="Pending review" value={stats.facilities_pending} />
        <Stat label="Registered donors" value={stats.donors} />
        <Stat label="Inventory batches" value={stats.inventory_rows} />
        <Stat label="Units tracked" value={stats.units_tracked} />
        <Stat label="Requests recorded" value={stats.requests_total} />
        <Stat label="Requests open" value={stats.requests_open} />
        <Stat label="Expired batches" value={stats.expired_batches} tone={stats.expired_batches > 0 ? "warn" : "plain"} />
        <Stat
          label="Cold-chain excursions"
          value={stats.coldchain_excursions}
          tone={stats.coldchain_excursions > 0 ? "warn" : "plain"}
        />
      </div>
    </EuCard>
  );
}

function Stat({ label, value, tone = "plain" }: { label: string; value: number; tone?: "plain" | "warn" }) {
  return (
    <div className="rounded-xl border border-eu-border bg-eu-bg px-4 py-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold", tone === "warn" && value > 0 ? "text-eu-warn" : "text-eu-text")}>
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Facilities                                                          */
/* ------------------------------------------------------------------ */

const FACILITY_STATUSES: FacilityStatus[] = ["pending", "under_review", "approved", "rejected", "suspended"];

/** Mirrors `EuBadge` tones so an approval never reads as a warning. */
const FACILITY_STATUS_TONE: Record<FacilityStatus, "ok" | "warn" | "red" | "neutral"> = {
  pending: "warn",
  under_review: "warn",
  approved: "ok",
  rejected: "red",
  suspended: "red",
};

function FacilitiesTab({ adminKey }: { adminKey: string }) {
  const [filter, setFilter] = useState<FacilityStatus | "all">("all");
  const { state, reload } = useResource(
    () => adminApi.facilities(adminKey, filter === "all" ? undefined : { status: filter }),
    [filter],
  );

  return (
    <div className="space-y-5">
      <EuCard className="p-5">
        <EuSectionTitle
          title="Facility applications"
          description="Every application MEDIPAL holds, most recently submitted first."
          action={
            <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </button>
          }
        />

        <div className="eu-scroll-x mt-4 pb-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
            className={cn(
              "eu-chip shrink-0",
              filter === "all" ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep" : "border-eu-border bg-eu-bg text-eu-muted",
            )}
          >
            All
          </button>
          {FACILITY_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              aria-pressed={filter === status}
              className={cn(
                "eu-chip shrink-0",
                filter === status
                  ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep"
                  : "border-eu-border bg-eu-bg text-eu-muted",
              )}
            >
              {FACILITY_STATUS_LABEL[status]}
            </button>
          ))}
        </div>

        {state.kind === "loading" && <LoadingCard label="Loading facilities…" />}
        {state.kind === "error" && <ErrorState error={state} onRetry={reload} />}
        {state.kind === "ready" &&
          (state.data.facilities.length === 0 ? (
            <EuEmptyState
              className="mt-4"
              icon={Building2}
              title={filter === "all" ? "No facilities on record" : "No facilities with that status"}
              description="Applications submitted through the blood bank apply form appear here for review."
            />
          ) : (
            <ul className="mt-4 space-y-3">
              {state.data.facilities.map((facility) => (
                <FacilityRow key={facility.id} adminKey={adminKey} facility={facility} onChanged={reload} />
              ))}
            </ul>
          ))}
      </EuCard>
    </div>
  );
}

function FacilityRow({
  adminKey,
  facility,
  onChanged,
}: {
  adminKey: string;
  facility: AdminFacility;
  onChanged: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ label: string; token: string } | null>(null);

  return (
    <li className="rounded-2xl border border-eu-border bg-eu-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.92rem] font-semibold text-eu-text">{facility.name}</p>
          <p className="mt-0.5 text-[0.78rem] text-eu-muted">
            {facility.category} · <span className="font-mono">{facility.reference}</span> ·{" "}
            {[facility.city, facility.district, facility.state].filter(Boolean).join(", ")}
          </p>
          <p className="mt-0.5 text-[0.74rem] text-eu-muted">
            Submitted {relativeTime(facility.submittedAt)} · {facility.activeCredentials} active credential(s) ·{" "}
            {facility.inventoryRows} inventory row(s)
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <EuBadge tone={FACILITY_STATUS_TONE[facility.status]}>{FACILITY_STATUS_LABEL[facility.status]}</EuBadge>
          {facility.hasBloodBank ? <EuBadge tone="neutral">Operates a blood bank</EuBadge> : null}
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-3 border-t border-eu-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
        <Detail
          label="Licence number"
          value={facility.licenseNumber ?? "not on file — approval is blocked without one"}
        />
        <Detail label="Authorised representative" value={facility.authorizedRep ?? "not recorded"} />
        <Detail label="Phone" value={facility.phone ?? "not recorded"} />
        <Detail label="Email" value={facility.email ?? "not recorded"} />
        <Detail label="Operating hours" value={facility.operatingHours ?? "not recorded"} />
        <Detail label="Address" value={facility.address ?? "not recorded"} />
        <Detail label="Verification basis" value={facility.dataSource.name} />
        <Detail label="Last verified" value={absoluteTime(facility.lastVerifiedAt)} />
        <Detail
          label="Reviewed"
          value={facility.reviewedAt ? `${absoluteTime(facility.reviewedAt)} · ${facility.reviewedBy ?? "—"}` : "not reviewed"}
        />
      </dl>

      {facility.reviewNotes && (
        <p className="mt-3 rounded-xl border border-eu-border bg-eu-surface px-3 py-2 text-[0.78rem] text-eu-muted">
          Review note: {facility.reviewNotes}
        </p>
      )}
      {facility.sourceNote && (
        <p className="mt-2 text-[0.74rem] text-eu-muted">Source note: {facility.sourceNote}</p>
      )}

      {revealed && (
        <div className="mt-3">
          <SecretReveal label={revealed.label} token={revealed.token} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-eu-border pt-3">
        <button
          type="button"
          onClick={() => {
            setReviewOpen((value) => !value);
            setCredentialsOpen(false);
          }}
          className="eu-btn eu-btn-secondary px-3 py-1.5 text-[0.74rem]"
        >
          {reviewOpen ? "Close review" : "Review application"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCredentialsOpen((value) => !value);
            setReviewOpen(false);
          }}
          className="eu-btn eu-btn-quiet px-3 py-1.5 text-[0.74rem]"
        >
          {credentialsOpen ? "Close credentials" : "Manage credentials"}
        </button>
      </div>

      {reviewOpen && (
        <ReviewForm
          adminKey={adminKey}
          facility={facility}
          onReviewed={(label, token) => {
            if (label && token) setRevealed({ label, token });
            onChanged();
          }}
        />
      )}

      {credentialsOpen && (
        <CredentialPanel
          adminKey={adminKey}
          facility={facility}
          onIssued={(token) => {
            setRevealed({ label: `Console credential for ${facility.name}`, token });
            onChanged();
          }}
          onChanged={onChanged}
        />
      )}
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[0.82rem] text-eu-text">{value}</dd>
    </div>
  );
}

const REVIEW_DECISIONS: FacilityStatus[] = ["under_review", "approved", "rejected", "suspended"];

type VerificationBasis = "" | "medipal_field_verified" | "facility_self_report";

function ReviewForm({
  adminKey,
  facility,
  onReviewed,
}: {
  adminKey: string;
  facility: AdminFacility;
  onReviewed: (label?: string, token?: string) => void;
}) {
  const action = useAction();
  const [decision, setDecision] = useState<FacilityStatus>(
    facility.status === "pending" ? "under_review" : facility.status,
  );
  const [notes, setNotes] = useState(facility.reviewNotes ?? "");
  const [basis, setBasis] = useState<VerificationBasis>("");
  const [verifiedOnSite, setVerifiedOnSite] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(
      async () => {
        const result = await adminApi.reviewFacility(adminKey, {
          facilityId: facility.id,
          decision,
          notes: notes.trim() || undefined,
          dataSourceId: basis || undefined,
          verifiedOnSite: basis === "medipal_field_verified" ? verifiedOnSite : undefined,
        });
        onReviewed(result.credential ? `Console credential for ${result.facility.name}` : undefined, result.credential?.token);
        return result.credential
          ? `${facility.name} marked ${FACILITY_STATUS_LABEL[decision]}. A console credential was issued — copy it now.`
          : `${facility.name} marked ${FACILITY_STATUS_LABEL[decision]}.`;
      },
      undefined,
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 border-t border-eu-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Decision">
        <select
          className="eu-field"
          value={decision}
          onChange={(event) => setDecision(event.target.value as FacilityStatus)}
        >
          {REVIEW_DECISIONS.map((option) => (
            <option key={option} value={option}>
              {FACILITY_STATUS_LABEL[option]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Verification basis" hint="Only applied when approving. Leave as is to keep the current source.">
        <select
          className="eu-field"
          value={basis}
          onChange={(event) => setBasis(event.target.value as VerificationBasis)}
        >
          <option value="">Keep the current basis</option>
          <option value="medipal_field_verified">Verified by a MEDIPAL field visit</option>
          <option value="facility_self_report">Reported by the facility itself</option>
        </select>
      </Field>

      <Field label="Review note" hint="Optional, up to 500 characters. Shown on the facility record.">
        <input className="eu-field" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>

      {basis === "medipal_field_verified" && (
        <label className="flex items-start gap-2 rounded-xl border border-[#f0dcb4] bg-[#fdf6e6] px-3 py-2.5 text-[0.78rem] text-[#8a5200] sm:col-span-2 lg:col-span-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={verifiedOnSite}
            onChange={(event) => setVerifiedOnSite(event.target.checked)}
          />
          <span>
            I confirm the licence was checked on site. The server rejects a field-verified approval without this
            attestation.
          </span>
        </label>
      )}

      {decision === "approved" && !facility.licenseNumber && (
        <div className="sm:col-span-2 lg:col-span-3">
          <EuNotice tone="warn" title="Approval will be rejected">
            This facility has no licence number on file. The server refuses to approve a facility without one.
          </EuNotice>
        </div>
      )}

      <div className="flex items-end">
        <button type="submit" disabled={action.busy} className="eu-btn eu-btn-primary gap-1.5 px-3 py-2.5 text-[0.78rem]">
          {action.busy ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          )}
          Apply decision
        </button>
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <ActionFeedback tone={action.tone} message={action.message} />
      </div>
    </form>
  );
}

function CredentialPanel({
  adminKey,
  facility,
  onIssued,
  onChanged,
}: {
  adminKey: string;
  facility: AdminFacility;
  onIssued: (token: string) => void;
  onChanged: () => void;
}) {
  const issueAction = useAction();
  const revokeAction = useAction();
  const [label, setLabel] = useState("primary");
  const [hint, setHint] = useState("");

  function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void issueAction.run(
      async () => {
        const result = await adminApi.issueCredential(adminKey, {
          facilityId: facility.id,
          label: label.trim() || undefined,
        });
        onIssued(result.token);
        return "Credential issued. It is shown once — copy it before you close this panel.";
      },
      onChanged,
    );
  }

  function revoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = hint.trim();
    if (value.replace("…", "").length < 3) {
      void revokeAction.run(async () => {
        throw new Error("Enter the credential hint shown at issuance, for example …a1b2c3.");
      });
      return;
    }
    void revokeAction.run(
      async () => {
        const result = await adminApi.revokeCredential(adminKey, { facilityId: facility.id, hint: value });
        return `${result.revoked} credential(s) revoked. The token no longer opens a console.`;
      },
      onChanged,
    );
  }

  return (
    <div className="mt-3 space-y-4 border-t border-eu-border pt-4">
      <EuNotice tone="info" title="Facility console credentials">
        MEDIPAL stores only a hash of each credential. A newly issued token is readable exactly once, at issuance;
        it can never be looked up again. To cut off access, revoke it by the hint shown when it was issued.
      </EuNotice>

      <form onSubmit={issue} className="grid gap-3 sm:grid-cols-[1.5fr_auto]">
        <Field label="Label for the new credential" hint="Up to 40 characters, for example a custodian or station name.">
          <input className="eu-field" value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={issueAction.busy || facility.status !== "approved"}
            className="eu-btn eu-btn-secondary gap-1.5 px-3 py-2.5 text-[0.78rem]"
          >
            {issueAction.busy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
            )}
            Issue credential
          </button>
        </div>
        {facility.status !== "approved" && (
          <p className="text-[0.74rem] text-eu-muted sm:col-span-2">
            Only an approved facility can hold a console credential.
          </p>
        )}
        <div className="sm:col-span-2">
          <ActionFeedback tone={issueAction.tone} message={issueAction.message} />
        </div>
      </form>

      <form onSubmit={revoke} className="grid gap-3 sm:grid-cols-[1.5fr_auto]">
        <Field label="Revoke by credential hint" hint="The hint shown when the credential was issued, for example …a1b2c3.">
          <input
            className="eu-field font-mono"
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder="…a1b2c3"
          />
        </Field>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={revokeAction.busy}
            className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2.5 text-[0.78rem] text-eu-red-deep"
          >
            {revokeAction.busy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
            )}
            Revoke
          </button>
        </div>
        <div className="sm:col-span-2">
          <ActionFeedback tone={revokeAction.tone} message={revokeAction.message} />
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

/** Mirrors `ALLOWED_TRANSITIONS` in `server/blood.mjs`. The server is the authority. */
const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  created: ["sent_to_eligible", "under_review", "cancelled"],
  sent_to_eligible: ["under_review", "proposal_accepted", "proposal_rejected", "cancelled"],
  under_review: ["proposal_accepted", "proposal_rejected", "cancelled"],
  proposal_accepted: ["dispatched", "cancelled"],
  proposal_rejected: ["sent_to_eligible", "cancelled"],
  dispatched: ["received", "cancelled"],
  received: ["closed"],
  closed: [],
  cancelled: [],
};

const ADVANCE_STATUSES: RequestStatus[] = [
  "sent_to_eligible",
  "under_review",
  "proposal_accepted",
  "proposal_rejected",
  "dispatched",
  "received",
  "closed",
  "cancelled",
];

function RequestsTab({ adminKey }: { adminKey: string }) {
  const action = useAction();
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<RequestStatus>("under_review");
  const [note, setNote] = useState("");
  const [supplyingFacilityReference, setSupplyingFacilityReference] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ref = reference.trim().toUpperCase();
    if (ref.length < 4) {
      setFieldError("Enter the request reference MEDIPAL issued, for example MED-BLD-XXXX.");
      return;
    }
    if (note.trim().length < 4) {
      setFieldError("Add a note of at least 4 characters — it is written to the request timeline.");
      return;
    }
    setFieldError(null);
    void action.run(
      async () => {
        const result = await adminApi.advanceRequest(adminKey, {
          reference: ref,
          status,
          note: note.trim(),
          supplyingFacilityReference: supplyingFacilityReference.trim() || undefined,
        });
        return `${result.request.public_ref} is now ${REQUEST_STATUS_LABEL[result.request.status]}.`;
      },
      () => {
        setNote("");
        setSupplyingFacilityReference("");
      },
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <EuCard className="p-5">
        <EuSectionTitle
          title="Advance a request"
          description="Move a request along the path the platform allows. The server rejects any transition that is not permitted from the request's current state."
        />
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Request reference">
              <input
                className="eu-field font-mono uppercase"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="MED-BLD-…"
              />
            </Field>
            <Field label="New status">
              <select
                className="eu-field"
                value={status}
                onChange={(event) => setStatus(event.target.value as RequestStatus)}
              >
                {ADVANCE_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {REQUEST_STATUS_LABEL[option]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplying facility reference" hint="Optional. Record which facility is supplying.">
              <input
                className="eu-field font-mono"
                value={supplyingFacilityReference}
                onChange={(event) => setSupplyingFacilityReference(event.target.value)}
              />
            </Field>
            <Field label="Note" hint="At least 4 characters. Shown on the public request timeline.">
              <input className="eu-field" value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>
          {fieldError && (
            <p className="eu-field-error" role="alert">
              {fieldError}
            </p>
          )}
          <button type="submit" disabled={action.busy} className="eu-btn eu-btn-primary gap-2">
            {action.busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ClipboardList className="h-4 w-4" aria-hidden />
            )}
            Record status change
          </button>
          <ActionFeedback tone={action.tone} message={action.message} />
        </form>
      </EuCard>

      <EuNotice tone="info" title="Permitted transitions">
        <ul className="space-y-1.5">
          {(Object.keys(ALLOWED_TRANSITIONS) as RequestStatus[]).map((from) => (
            <li key={from}>
              <span className="font-medium text-eu-text">{REQUEST_STATUS_LABEL[from]}</span>
              {" → "}
              {ALLOWED_TRANSITIONS[from].length === 0
                ? "no further transitions"
                : ALLOWED_TRANSITIONS[from].map((to) => REQUEST_STATUS_LABEL[to]).join(", ")}
            </li>
          ))}
        </ul>
      </EuNotice>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

const AUDIT_LIMITS = [25, 50, 100, 200] as const;

function AuditTab({ adminKey }: { adminKey: string }) {
  const [limit, setLimit] = useState<number>(50);
  const { state, reload } = useResource(() => adminApi.audit(adminKey, { limit }), [limit]);

  return (
    <EuCard className="p-5">
      <EuSectionTitle
        title="Audit trail"
        description="Every recorded action, newest first. Credential values are never written here."
        action={
          <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
        }
      />

      <div className="eu-scroll-x mt-4 pb-1">
        {AUDIT_LIMITS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setLimit(value)}
            aria-pressed={limit === value}
            className={cn(
              "eu-chip shrink-0",
              limit === value ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep" : "border-eu-border bg-eu-bg text-eu-muted",
            )}
          >
            Latest {value}
          </button>
        ))}
      </div>

      {state.kind === "loading" && <LoadingCard label="Loading the audit trail…" />}
      {state.kind === "error" && <ErrorState error={state} onRetry={reload} />}
      {state.kind === "ready" &&
        (state.data.entries.length === 0 ? (
          <EuEmptyState
            className="mt-4"
            icon={ScrollText}
            title="No audit entries"
            description="Actions taken through the consoles are written here as they happen."
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[0.8rem]">
              <thead className="bg-eu-surface text-[0.68rem] uppercase tracking-[0.12em] text-eu-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">When</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actor</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Entity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-eu-border">
                {state.data.entries.map((entry: AuditEntry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-eu-muted">{absoluteTime(entry.createdAt)}</td>
                    <td className="px-4 py-3 text-eu-text">{entry.actor}</td>
                    <td className="px-4 py-3 font-mono text-[0.74rem] text-eu-text">{entry.action}</td>
                    <td className="px-4 py-3 text-eu-muted">
                      {entry.entity}
                      {entry.entityId ? <span className="font-mono"> · {entry.entityId}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-eu-muted">
                      {entry.detail ? (
                        <code className="break-all font-mono text-[0.72rem]">{JSON.stringify(entry.detail)}</code>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </EuCard>
  );
}

/* ------------------------------------------------------------------ */
/* Self-test                                                           */
/* ------------------------------------------------------------------ */

function SelfTestTab({ adminKey }: { adminKey: string }) {
  const action = useAction();
  const [result, setResult] = useState<SelfTestResult | null>(null);

  function run() {
    void action.run(async () => {
      const outcome = await adminApi.selfTest(adminKey);
      setResult(outcome);
      return `${outcome.summary.passed} of ${outcome.summary.total} checks passed.`;
    });
  }

  return (
    <div className="space-y-5">
      <EuCard className="p-5">
        <EuSectionTitle
          title="Platform self-test"
          description="Runs MEDIPAL's own checks against the live database. The test writes inside a transaction and rolls it back, so it leaves nothing behind."
          action={
            <button type="button" onClick={run} disabled={action.busy} className="eu-btn eu-btn-primary gap-1.5 px-3 py-2 text-[0.78rem]">
              {action.busy ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Activity className="h-3.5 w-3.5" aria-hidden />
              )}
              Run self-test
            </button>
          }
        />
        <div className="mt-4">
          <ActionFeedback tone={action.tone} message={action.message} />
        </div>

        {result === null ? (
          action.busy ? null : (
            <EuEmptyState
              className="mt-4"
              icon={Activity}
              title="The self-test has not been run in this session"
              description="Run it to check that the blood bank's data layer, isolation and transitions behave as expected."
            />
          )
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <EuBadge tone={result.summary.failed === 0 ? "ok" : "red"}>
                {result.summary.passed}/{result.summary.total} passed
              </EuBadge>
              {result.summary.failed > 0 && <EuBadge tone="red">{result.summary.failed} failed</EuBadge>}
              <span className="text-[0.76rem] text-eu-muted">Ran {absoluteTime(result.ranAt)}</span>
            </div>

            <ul className="space-y-2">
              {result.checks.map((check) => (
                <li
                  key={check.id}
                  className={cn(
                    "rounded-xl border px-3.5 py-3",
                    check.status === "pass" ? "border-[#bfe3ce] bg-[#eefaf2]" : "border-[#f3c4c0] bg-[#fdf1f0]",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {check.status === "pass" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-eu-ok" aria-hidden />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-eu-red-deep" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="text-[0.84rem] font-semibold text-eu-text">{check.label}</p>
                      <p className="mt-0.5 break-words text-[0.78rem] text-eu-muted">{check.evidence}</p>
                      <p className="mt-0.5 font-mono text-[0.7rem] text-eu-muted">{check.id}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <EuNotice tone="info">{result.note}</EuNotice>
          </div>
        )}
      </EuCard>
    </div>
  );
}
