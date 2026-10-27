/**
 * Blood data — Platform admin console (§17, §18).
 *
 * The screen that owns Bihar availability synchronisation: how much of the
 * database is genuinely live, which providers are feeding it, the health of
 * each provider, and a triggered sync for an authorised administrator.
 *
 * Three rules this screen keeps. The platform-admin key lives in React state
 * for this tab only — never localStorage, sessionStorage, the URL or a log.
 * Nothing here invents a figure: a success rate of "no runs yet" is rendered
 * as such, never as 100%. And a provider that is disabled or lacks credentials
 * is shown, with the reason, rather than hidden behind a hopeful button.
 */

import { useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  type LucideIcon,
  HeartPulse,
  KeyRound,
  LoaderCircle,
  LogOut,
  Play,
  RefreshCw,
  Radio,
  ServerCog,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice, EuSectionTitle } from "@/components/eupchar/ui";
import {
  ActionFeedback,
  ErrorState,
  Field,
  LoadingCard,
  useAction,
  useResource,
} from "@/components/blood-bank/consoleKit";
import { cn } from "@/lib/cn";
import { absoluteTime, relativeTime } from "@/lib/blood/presentation";
import { adminApi } from "@/services/blood/api";
import type {
  ProviderHealthSource,
  ProviderHealthState,
  SyncRunRecord,
} from "@/services/blood/types";

/* ------------------------------------------------------------------ */
/* Route entry                                                         */
/* ------------------------------------------------------------------ */

export default function BloodDataAdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);

  return (
    <EuShell wide>
      <EuPageHeader
        eyebrow="Blood data · Platform admin"
        title="Bihar availability data"
        description="Monitor and run the synchronisation that keeps Bihar blood availability current. Access requires the MEDIPAL platform-admin key configured on the server."
        breadcrumb={[{ label: "Blood Bank", to: "/" }, { label: "Blood data" }]}
      />

      {adminKey ? (
        <BloodDataWorkspace adminKey={adminKey} onSignOut={() => setAdminKey(null)} />
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
      await adminApi.bloodData(value);
      onAuthed(value);
      return "Signed in.";
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <EuCard className="p-6 sm:p-7">
        <EuSectionTitle
          title="Sign in to the blood-data console"
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
              <li>See how many centres and inventory rows MEDIPAL holds, and how many are genuinely live.</li>
              <li>Read each provider's health, its last successful sync and its last failure.</li>
              <li>Trigger a sync for one provider and read the per-record outcome immediately.</li>
              <li>Walk the sync log, including the individual records a run rejected and why.</li>
            </ul>
          </EuNotice>
        ) : (
          <EuNotice tone="warn" title="The admin console is not configured">
            {session.state.data.message}
          </EuNotice>
        )}

        <EuNotice tone="info" title="LIVE means observed, not guessed">
          A figure is LIVE only when an authorised source observed it within the last 30 minutes. MEDIPAL never
          re-labels an old number as live, and never writes a stock figure it did not receive.
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
  { id: "providers", label: "Providers" },
  { id: "log", label: "Sync log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function BloodDataWorkspace({ adminKey, onSignOut }: { adminKey: string; onSignOut: () => void }) {
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
              tab === option.id
                ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep"
                : "border-eu-border bg-eu-bg text-eu-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "overview" && <OverviewTab adminKey={adminKey} />}
        {tab === "providers" && <ProvidersTab adminKey={adminKey} />}
        {tab === "log" && <SyncLogTab adminKey={adminKey} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview — statistics (§18)                                         */
/* ------------------------------------------------------------------ */

function OverviewTab({ adminKey }: { adminKey: string }) {
  const { state, reload } = useResource(() => adminApi.bloodData(adminKey));

  if (state.kind === "loading") return <LoadingCard label="Loading blood-data statistics…" />;
  if (state.kind === "error") return <ErrorState error={state} onRetry={reload} />;

  const { overview, health, scheduler } = state.data;

  return (
    <div className="space-y-5">
      <EuCard className="p-5">
        <EuSectionTitle
          title="Availability statistics"
          description={`Counted directly from the database at ${absoluteTime(overview.generatedAt)}.`}
          action={
            <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </button>
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Blood centres on record" value={overview.centres.total} icon={Database} />
          <Stat
            label="Approved centres"
            value={overview.centres.approved}
            hint={`${overview.centres.fromProviders} from a provider · ${overview.centres.fromVerifiedCentres} centre-verified`}
            icon={Building2}
          />
          <Stat
            label="Inventory rows"
            value={overview.inventory.rows}
            hint={`${overview.inventory.centresWithStock} centre(s) reporting`}
            icon={ServerCog}
          />
          <Stat
            label={`Live rows (< ${overview.thresholdsMinutes.live} min)`}
            value={overview.inventory.liveRows}
            tone={overview.inventory.liveRows > 0 ? "ok" : "plain"}
            icon={Radio}
          />
          <Stat
            label={`Stale rows (> ${overview.thresholdsMinutes.stale} min)`}
            value={overview.inventory.staleRows}
            tone={overview.inventory.staleRows > 0 ? "warn" : "plain"}
            icon={Clock}
          />
          <Stat
            label="Unavailable rows"
            value={overview.inventory.unavailableRows}
            hint={`${overview.inventory.unknownRows} with an unstated status`}
            icon={XCircle}
          />
        </div>
      </EuCard>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <EuCard className="p-5">
          <EuSectionTitle
            title="Synchronisation health"
            description="Outcomes over the last seven days. A percentage appears only once there is something to measure."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Stat label="Runs (7 days)" value={overview.sync.runsLastSevenDays} icon={Activity} />
            <Stat
              label="Success rate"
              value={overview.sync.successRate}
              unit="%"
              emptyLabel="No runs yet"
              icon={HeartPulse}
            />
            <Stat label="Succeeded" value={overview.sync.succeeded} icon={CheckCircle2} />
            <Stat
              label="Failed"
              value={overview.sync.failed}
              tone={overview.sync.failed > 0 ? "warn" : "plain"}
              icon={AlertTriangle}
            />
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-eu-border pt-4 sm:grid-cols-2">
            <Detail label="Last successful sync" value={absoluteTime(overview.sync.lastSuccessfulSync)} />
            <Detail
              label="Last attempt"
              value={
                overview.sync.lastAttemptAt
                  ? `${absoluteTime(overview.sync.lastAttemptAt)} · ${relativeTime(overview.sync.lastAttemptAt)}`
                  : "never"
              }
            />
            <Detail
              label="Scheduled interval"
              value={`every ${scheduler.intervalMinutes} minute(s)${scheduler.running ? "" : " — scheduler not running"}`}
            />
            <Detail
              label="Last scheduled tick"
              value={scheduler.lastTickAt ? relativeTime(scheduler.lastTickAt) : "not yet this process"}
            />
          </dl>
        </EuCard>

        <div className="space-y-4">
          <ProviderSummary health={health.sources} />
          <EuNotice tone="info" title={health.notice}>{health.notice}</EuNotice>
        </div>
      </div>
    </div>
  );
}

function ProviderSummary({ health }: { health: ProviderHealthSource[] }) {
  return (
    <EuCard className="p-5">
      <EuSectionTitle
        title="Providers"
        description="Each source MEDIPAL can read. A disabled or unconfigured source is listed, never hidden."
      />
      <ul className="mt-4 space-y-3">
        {health.map((source) => (
          <li
            key={source.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-eu-border bg-eu-bg px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-[0.86rem] font-semibold text-eu-text">{source.label}</p>
              <p className="mt-0.5 font-mono text-[0.72rem] text-eu-muted">{source.id}</p>
              {source.healthMessage && (
                <p className="mt-1 text-[0.76rem] leading-relaxed text-eu-muted">{source.healthMessage}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <EuBadge tone={HEALTH_TONE[source.health] ?? "neutral"}>{HEALTH_LABEL[source.health] ?? source.health}</EuBadge>
              <span className="text-[0.7rem] uppercase tracking-[0.12em] text-eu-muted">
                {source.mode === "push" ? "direct entry" : "scheduled pull"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </EuCard>
  );
}

/* ------------------------------------------------------------------ */
/* Providers — per-source health and a manual run (§18, §25)           */
/* ------------------------------------------------------------------ */

function ProvidersTab({ adminKey }: { adminKey: string }) {
  const { state, reload } = useResource(() => adminApi.bloodData(adminKey));
  const action = useAction();

  function runSync(source: ProviderHealthSource) {
    void action.run(async () => {
      const result = await adminApi.runSync(adminKey, source.id);
      const { records } = result;
      if (result.status === "skipped") return result.message ?? "The run was skipped.";
      return `${source.label}: received ${records.received}, inserted ${records.inserted}, updated ${records.updated}, unchanged ${records.unchanged}, rejected ${records.failed}.`;
    }, reload);
  }

  return (
    <div className="space-y-5">
      <EuCard className="p-5">
        <EuSectionTitle
          title="Provider health"
          description="Read from the provider registry and the last sync attempt. Nothing here is inferred."
          action={
            <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </button>
          }
        />

        {state.kind === "loading" && <LoadingCard label="Loading provider health…" />}
        {state.kind === "error" && <ErrorState error={state} onRetry={reload} />}
        {state.kind === "ready" && (
          <ul className="mt-4 space-y-3">
            {state.data.health.sources.map((source) => (
              <li key={source.id} className="rounded-2xl border border-eu-border bg-eu-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.92rem] font-semibold text-eu-text">{source.label}</p>
                    <p className="mt-0.5 font-mono text-[0.74rem] text-eu-muted">{source.id}</p>
                  </div>
                  <EuBadge tone={HEALTH_TONE[source.health] ?? "neutral"}>
                    {HEALTH_LABEL[source.health] ?? source.health}
                  </EuBadge>
                </div>

                {source.healthMessage && (
                  <p className="mt-2 text-[0.78rem] leading-relaxed text-eu-muted">{source.healthMessage}</p>
                )}

                <dl className="mt-3 grid gap-x-6 gap-y-3 border-t border-eu-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Enabled" value={source.enabled ? "yes" : "no"} />
                  <Detail label="Configured" value={source.configured ? "yes" : "credentials missing"} />
                  <Detail label="Transport" value={source.mode === "push" ? "push (centre writes directly)" : "pull (scheduled fetch)"} />
                  <Detail label="Priority" value={String(source.priority)} />
                  <Detail label="Last success" value={source.lastSuccessfulSync ? relativeTime(source.lastSuccessfulSync) : "never"} />
                  <Detail label="Last failure" value={source.lastFailedSync ? relativeTime(source.lastFailedSync) : "none recorded"} />
                </dl>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-eu-border pt-3">
                  <button
                    type="button"
                    onClick={() => runSync(source)}
                    disabled={action.busy || !source.enabled || !source.configured || source.mode === "push"}
                    className="eu-btn eu-btn-secondary gap-1.5 px-3 py-1.5 text-[0.74rem]"
                  >
                    {action.busy ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Play className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Run sync now
                  </button>
                  {source.mode === "push" && (
                    <span className="text-[0.74rem] text-eu-muted">
                      A push provider is written by the centre itself; there is nothing to pull.
                    </span>
                  )}
                  {source.mode !== "push" && !source.configured && (
                    <span className="text-[0.74rem] text-eu-muted">
                      Awaiting authorised credentials on the server before this source can be read.
                    </span>
                  )}
                  {source.mode !== "push" && source.configured && !source.enabled && (
                    <span className="text-[0.74rem] text-eu-muted">This provider is disabled in the registry.</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <ActionFeedback tone={action.tone} message={action.message} />
        </div>
      </EuCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sync log (§18)                                                      */
/* ------------------------------------------------------------------ */

const RUN_LIMITS = [10, 25, 50] as const;

function SyncLogTab({ adminKey }: { adminKey: string }) {
  const [limit, setLimit] = useState<number>(25);
  const { state, reload } = useResource(() => adminApi.syncRuns(adminKey, { limit }), [limit]);

  return (
    <EuCard className="p-5">
      <EuSectionTitle
        title="Sync log"
        description="Every run MEDIPAL has attempted, newest first, with the records a run rejected and why."
        action={
          <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
        }
      />

      <div className="eu-scroll-x mt-4 pb-1">
        {RUN_LIMITS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setLimit(value)}
            aria-pressed={limit === value}
            className={cn(
              "eu-chip shrink-0",
              limit === value
                ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep"
                : "border-eu-border bg-eu-bg text-eu-muted",
            )}
          >
            Latest {value}
          </button>
        ))}
      </div>

      {state.kind === "loading" && <LoadingCard label="Loading the sync log…" />}
      {state.kind === "error" && <ErrorState error={state} onRetry={reload} />}
      {state.kind === "ready" &&
        (state.data.runs.length === 0 ? (
          <EuEmptyState
            className="mt-4"
            icon={ServerCog}
            title="No sync runs recorded"
            description="A run appears here as soon as a provider is synchronised, whether on schedule or triggered by hand."
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {state.data.runs.map((run) => (
              <SyncRunRow key={run.runId} run={run} />
            ))}
          </ul>
        ))}
    </EuCard>
  );
}

function SyncRunRow({ run }: { run: SyncRunRecord }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-2xl border border-eu-border bg-eu-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9rem] font-semibold text-eu-text">
            <span className="font-mono">{run.provider}</span>
          </p>
          <p className="mt-0.5 text-[0.76rem] text-eu-muted">
            Started {relativeTime(run.startedAt)}
            {run.durationMs !== null ? ` · took ${(run.durationMs / 1000).toFixed(1)}s` : ""}
            {run.requestAttempts !== null ? ` · ${run.requestAttempts} request attempt(s)` : ""}
          </p>
        </div>
        <EuBadge tone={RUN_TONE[run.status] ?? "neutral"}>{RUN_LABEL[run.status] ?? run.status}</EuBadge>
      </div>

      {run.message && <p className="mt-2 text-[0.78rem] leading-relaxed text-eu-muted">{run.message}</p>}

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-eu-border pt-3 sm:grid-cols-3 lg:grid-cols-6">
        <Detail label="Received" value={count(run.recordsReceived)} />
        <Detail label="Inserted" value={count(run.recordsInserted)} />
        <Detail label="Updated" value={count(run.recordsUpdated)} />
        <Detail label="Unchanged" value={count(run.recordsUnchanged)} />
        <Detail label="Rejected" value={count(run.recordsFailed)} />
        <Detail label="Centres" value={count(run.centresUpserted)} />
      </dl>

      {run.errors.length > 0 && (
        <div className="mt-3 border-t border-eu-border pt-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="eu-btn eu-btn-quiet px-3 py-1.5 text-[0.74rem]"
          >
            {open ? "Hide" : "Show"} {run.errors.length} rejected record(s)
          </button>
          {open && (
            <ul className="mt-3 space-y-2">
              {run.errors.map((error, index) => (
                <li
                  key={`${run.runId}-${index}`}
                  className="rounded-xl border border-[#f3c4c0] bg-[#fdf1f0] px-3.5 py-2.5"
                >
                  <p className="text-[0.78rem] font-semibold text-eu-red-deep">{error.message}</p>
                  <p className="mt-0.5 font-mono text-[0.7rem] text-eu-muted">
                    {error.type}
                    {error.externalId ? ` · ${error.externalId}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Shared presentation                                                 */
/* ------------------------------------------------------------------ */

const HEALTH_TONE: Record<ProviderHealthState, "ok" | "warn" | "red" | "neutral"> = {
  healthy: "ok",
  degraded: "warn",
  offline: "red",
  not_configured: "neutral",
  unknown: "neutral",
};

const HEALTH_LABEL: Record<ProviderHealthState, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  offline: "Offline",
  not_configured: "Not configured",
  unknown: "No data yet",
};

const RUN_TONE: Record<string, "ok" | "warn" | "red" | "neutral"> = {
  running: "neutral",
  success: "ok",
  partial: "warn",
  failed: "red",
  skipped: "neutral",
};

const RUN_LABEL: Record<string, string> = {
  running: "Running",
  success: "Succeeded",
  partial: "Partly succeeded",
  failed: "Failed",
  skipped: "Skipped",
};

/** A nullable counter is shown as "—", never as an invented zero. */
function count(value: number | null): string {
  return value === null ? "—" : String(value);
}

function Stat({
  label,
  value,
  unit = "",
  hint,
  tone = "plain",
  emptyLabel = "n/a",
  icon: Icon,
}: {
  label: string;
  value: number | null;
  unit?: string;
  hint?: string;
  tone?: "plain" | "ok" | "warn";
  emptyLabel?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-eu-border bg-eu-bg px-4 py-3">
      <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold",
          tone === "warn" ? "text-eu-warn" : tone === "ok" ? "text-eu-ok" : "text-eu-text",
        )}
      >
        {value === null ? <span className="text-[0.9rem] font-medium text-eu-muted">{emptyLabel}</span> : `${value}${unit}`}
      </p>
      {hint && <p className="mt-0.5 text-[0.7rem] text-eu-muted">{hint}</p>}
    </div>
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
