/**
 * Blood Bank — Facility Console.
 *
 * The operator-facing screen for an approved blood facility: publish stock,
 * answer matching requests, move units between facilities and keep the
 * cold chain honest.
 *
 * Two things this screen refuses to do. It never fabricates a figure — an
 * empty list means the server returned nothing, and a failure is always shown
 * as a failure with the server's own reason. And it never persists the facility
 * bearer token: the token lives in React state for this tab only.
 */

import { useState, type FormEvent } from "react";
import {
  ArrowRightLeft,
  Bell,
  Boxes,
  ClipboardList,
  Clock3,
  Droplets,
  KeyRound,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Truck,
} from "lucide-react";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice, EuSectionTitle } from "@/components/eupchar/ui";
import {
  ActionFeedback,
  ErrorState,
  Field,
  LoadingCard,
  StatusPill,
  useAction,
  useResource,
} from "@/components/blood-bank/consoleKit";
import { cn } from "@/lib/cn";
import {
  INVENTORY_STATUS_LABEL,
  INVENTORY_STATUS_TONE,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  absoluteTime,
  formatQuantity,
  relativeTime,
} from "@/lib/blood/presentation";
import { facilityApi } from "@/services/blood/api";
import {
  BLOOD_COMPONENTS,
  BLOOD_GROUPS,
  type BloodComponent,
  type BloodGroup,
  type ColdChainPassport,
  type FacilityConsoleIdentity,
  type FacilityNotification,
  type FacilityOpenRequest,
  type FacilityTransfer,
  type InventoryItem,
  type InventoryMovement,
} from "@/services/blood/types";

/* ------------------------------------------------------------------ */
/* Route entry                                                         */
/* ------------------------------------------------------------------ */

interface FacilitySession {
  token: string;
  identity: FacilityConsoleIdentity;
}

export default function FacilityConsolePage() {
  const [session, setSession] = useState<FacilitySession | null>(null);

  return (
    <EuShell wide>
      <EuPageHeader
        eyebrow="Blood Bank · Facility console"
        title="Facility console"
        description="Publish the stock your blood bank is holding, answer matching requests, move units between facilities and record each cold-chain reading. Access requires the token MEDIPAL issued when your facility was approved."
        breadcrumb={[{ label: "Blood Bank", to: "/" }, { label: "Facility console" }]}
      />

      {session ? (
        <FacilityWorkspace
          token={session.token}
          identity={session.identity}
          onSignOut={() => setSession(null)}
        />
      ) : (
        <FacilityGate onAuthed={(token, identity) => setSession({ token, identity })} />
      )}
    </EuShell>
  );
}

/* ------------------------------------------------------------------ */
/* Sign-in gate                                                        */
/* ------------------------------------------------------------------ */

function FacilityGate({
  onAuthed,
}: {
  onAuthed: (token: string, identity: FacilityConsoleIdentity) => void;
}) {
  const [token, setToken] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const action = useAction();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = token.trim();
    if (value.length < 8) {
      setFieldError("A facility access token is at least 8 characters long.");
      return;
    }
    setFieldError(null);
    void action.run(async () => {
      const identity = await facilityApi.me(value);
      onAuthed(value, identity);
      return identity.facility.name;
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <EuCard className="p-6 sm:p-7">
        <EuSectionTitle
          title="Open your console"
          description="Paste the facility access token you were issued. It is checked against the platform and kept in this tab's memory only."
        />
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field
            label="Facility access token"
            hint="Never share it. If it is lost or exposed, ask the MEDIPAL platform team to revoke and re-issue."
          >
            <input
              type="password"
              className="eu-field font-mono"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste your token"
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
            disabled={action.busy}
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

      <EuNotice tone="info" title="What the console can and cannot do">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Stock you publish is attributed to your facility as self-reported, with the time you last updated it.</li>
          <li>A proposal can never offer more units than your recorded stock.</li>
          <li>Dispatching a transfer deducts stock here, and receiving one adds it at the other facility.</li>
          <li>The console cannot edit the platform&apos;s verified facility record or another facility&apos;s data.</li>
        </ul>
      </EuNotice>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "inventory", label: "Inventory" },
  { id: "movements", label: "Movements" },
  { id: "expiry", label: "Expiry" },
  { id: "requests", label: "Requests" },
  { id: "transfers", label: "Transfers" },
  { id: "cold-chain", label: "Cold chain" },
  { id: "notifications", label: "Notifications" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function FacilityWorkspace({
  token,
  identity,
  onSignOut,
}: {
  token: string;
  identity: FacilityConsoleIdentity;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div>
      <EuCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-[0.95rem] font-semibold text-eu-text">{identity.facility.name}</p>
          <p className="text-[0.78rem] text-eu-muted">
            {identity.facility.category} · <span className="font-mono">{identity.facility.reference}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EuBadge tone={identity.facility.status === "approved" ? "ok" : "warn"}>
            {identity.facility.status.replace("_", " ")}
          </EuBadge>
          <button type="button" onClick={onSignOut} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </div>
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
        {tab === "overview" && <OverviewTab identity={identity} />}
        {tab === "inventory" && <InventoryTab token={token} />}
        {tab === "movements" && <MovementsTab token={token} />}
        {tab === "expiry" && <ExpiryTab token={token} />}
        {tab === "requests" && <RequestsTab token={token} />}
        {tab === "transfers" && <TransfersTab token={token} />}
        {tab === "cold-chain" && <ColdChainTab token={token} />}
        {tab === "notifications" && <NotificationsTab token={token} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function OverviewTab({ identity }: { identity: FacilityConsoleIdentity }) {
  const facility = identity.facility;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <EuCard className="p-5">
        <EuSectionTitle title={facility.name} description={`${facility.category} · ${facility.reference}`} />
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detail label="Address" value={facility.address ?? "not recorded"} />
          <Detail
            label="City"
            value={[facility.city, facility.district, facility.state].filter(Boolean).join(", ")}
          />
          <Detail label="Postal code" value={facility.postalCode ?? "not recorded"} />
          <Detail label="Phone" value={facility.phone ?? "not recorded"} />
          <Detail label="Emergency hotline" value={facility.emergencyHotline ?? "not recorded"} />
          <Detail label="Operating hours" value={facility.operatingHours ?? "not recorded"} />
          <Detail label="Last verified" value={absoluteTime(facility.lastVerifiedAt)} />
          <Detail label="Verified basis" value={identity.dataSource.name} />
        </dl>
      </EuCard>

      <div className="space-y-4">
        <EuCard className="p-5">
          <EuSectionTitle title="Published stock" description="Counted from the batches you have reported." />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Batch rows" value={identity.inventory.batch_rows} />
            <Metric label="Units available" value={identity.inventory.total_units} />
          </div>
        </EuCard>
        <EuNotice tone="info" title="Attribution">
          {identity.provenance}
        </EuNotice>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[0.85rem] text-eu-text">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-eu-border bg-eu-bg px-4 py-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xl font-semibold text-eu-text">
        <Droplets className="h-4 w-4 text-eu-red" aria-hidden />
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

function InventoryTab({ token }: { token: string }) {
  const { state, reload } = useResource(() => facilityApi.inventory(token));

  return (
    <div className="space-y-5">
      <StockReportForm token={token} onSaved={reload} />

      <EuCard className="p-5">
        <EuSectionTitle
          title="Reported stock"
          description="Every batch currently attributed to your facility."
          action={
            <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </button>
          }
        />

        {state.kind === "loading" && <LoadingCard label="Loading inventory…" />}
        {state.kind === "error" && <ErrorState error={state} onRetry={reload} />}
        {state.kind === "ready" &&
          (state.data.inventory.length === 0 ? (
            <EuEmptyState
              className="mt-4"
              icon={Boxes}
              title="No stock reported yet"
              description="Until a batch is published here, no figure appears for your facility in the public availability search. That is deliberate — MEDIPAL never guesses."
            />
          ) : (
            <ul className="mt-4 space-y-3">
              {state.data.inventory.map((item) => (
                <InventoryRow key={item.id} token={token} item={item} onChanged={reload} />
              ))}
            </ul>
          ))}
      </EuCard>
    </div>
  );
}

function StockReportForm({ token, onSaved }: { token: string; onSaved: () => void }) {
  const action = useAction();
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(BLOOD_GROUPS[0]);
  const [component, setComponent] = useState<BloodComponent>(BLOOD_COMPONENTS[0]);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("Units");
  const [batchNumber, setBatchNumber] = useState("");
  const [collectionDate, setCollectionDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [status, setStatus] = useState("available");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      setFieldError("Quantity must be a whole number of 0 or more.");
      return;
    }
    if (reason.trim().length < 4) {
      setFieldError("Add a short reason — it is recorded against the stock movement.");
      return;
    }
    setFieldError(null);
    void action.run(async () => {
      await facilityApi.reportStock(token, {
        bloodGroup,
        component,
        quantity: qty,
        unit,
        batchNumber: batchNumber.trim() || undefined,
        collectionDate: collectionDate || undefined,
        expiryDate: expiryDate || undefined,
        storageLocation: storageLocation.trim() || undefined,
        status,
        notes: notes.trim() || undefined,
        reason: reason.trim(),
      });
      onSaved();
      return "Stock published. It now appears in the public availability search with your facility as the source.";
    });
  }

  return (
    <EuCard className="p-5">
      <EuSectionTitle
        title="Report stock"
        description="Reporting the same batch number for the same group and component updates that batch rather than creating a second one."
      />
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Blood group">
            <select className="eu-field" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Component">
            <select className="eu-field" value={component} onChange={(e) => setComponent(e.target.value as BloodComponent)}>
              {BLOOD_COMPONENTS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input
              className="eu-field"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 12"
            />
          </Field>
          <Field label="Unit">
            <select className="eu-field" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="Units">Units</option>
              <option value="mL">mL</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Batch number" hint="Optional. Reuse it to update an existing batch.">
            <input className="eu-field" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
          </Field>
          <Field label="Collected on">
            <input type="date" className="eu-field" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} />
          </Field>
          <Field label="Expires on">
            <input type="date" className="eu-field" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
          <Field label="Storage location">
            <input className="eu-field" value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label="Status">
            <select className="eu-field" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="quarantine">Quarantine</option>
            </select>
          </Field>
          <Field label="Reason for this report" hint="At least 4 characters. Recorded against the movement for audit.">
            <input className="eu-field" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>

        <Field label="Notes">
          <input className="eu-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {fieldError && (
          <p className="eu-field-error" role="alert">
            {fieldError}
          </p>
        )}

        <button type="submit" disabled={action.busy} className="eu-btn eu-btn-primary gap-2">
          {action.busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Publish stock
        </button>
        <ActionFeedback tone={action.tone} message={action.message} />
      </form>
    </EuCard>
  );
}

function InventoryRow({
  token,
  item,
  onChanged,
}: {
  token: string;
  item: InventoryItem;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const action = useAction();
  const [movementType, setMovementType] = useState("issue");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setFieldError("Quantity must be a whole number of 1 or more.");
      return;
    }
    if (reason.trim().length < 5) {
      setFieldError("Add a reason of at least 5 characters.");
      return;
    }
    setFieldError(null);
    void action.run(
      async () => {
        await facilityApi.adjustStock(token, { inventoryId: item.id, movementType, quantity: qty, reason: reason.trim() });
        return "Movement recorded against this batch.";
      },
      () => {
        setQuantity("");
        setReason("");
        onChanged();
      },
    );
  }

  return (
    <li className="rounded-2xl border border-eu-border bg-eu-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9rem] font-semibold text-eu-text">
            {item.bloodGroup} · {item.component}
          </p>
          <p className="mt-0.5 text-[0.78rem] text-eu-muted">
            {formatQuantity(item.quantity, item.unit)}
            {item.batchNumber ? ` · batch ${item.batchNumber}` : ""}
            {item.storageLocation ? ` · ${item.storageLocation}` : ""}
          </p>
          <p className="mt-0.5 text-[0.74rem] text-eu-muted">
            Expires {absoluteTime(item.expiryDate)} · updated {relativeTime(item.lastUpdatedAt)}
            {typeof item.daysToExpiry === "number" ? ` · ${item.daysToExpiry} day(s) to expiry` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusPill label={INVENTORY_STATUS_LABEL[item.effectiveStatus]} tone={INVENTORY_STATUS_TONE[item.effectiveStatus]} />
          {item.status !== item.effectiveStatus && (
            <span className="text-[0.7rem] text-eu-muted">recorded as {item.status.replace("_", " ")}</span>
          )}
          <button type="button" onClick={() => setOpen((value) => !value)} className="eu-btn eu-btn-quiet px-2.5 py-1.5 text-[0.74rem]">
            {open ? "Cancel" : "Record movement"}
          </button>
        </div>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-eu-border pt-4 sm:grid-cols-[1.2fr_0.8fr_2fr_auto]">
          <Field label="Movement type">
            <select className="eu-field" value={movementType} onChange={(e) => setMovementType(e.target.value)}>
              <option value="issue">Issued out</option>
              <option value="transfer_out">Transfer out</option>
              <option value="expiry_quarantine">Quarantine on expiry</option>
              <option value="manual_adjustment">Manual adjustment</option>
            </select>
          </Field>
          <Field label="Quantity">
            <input className="eu-field" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Reason">
            <input className="eu-field" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={action.busy} className="eu-btn eu-btn-secondary gap-1.5 px-3 py-2.5 text-[0.78rem]">
              {action.busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ClipboardList className="h-3.5 w-3.5" aria-hidden />}
              Record
            </button>
          </div>
          {fieldError && (
            <p className="eu-field-error sm:col-span-4" role="alert">
              {fieldError}
            </p>
          )}
          {action.message && (
            <div className="sm:col-span-4">
              <ActionFeedback tone={action.tone} message={action.message} />
            </div>
          )}
        </form>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Movements                                                           */
/* ------------------------------------------------------------------ */

export const MOVEMENT_LABEL: Record<string, string> = {
  receipt: "Stock received",
  manual_adjustment: "Manual adjustment",
  issue: "Issued out",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  expiry_quarantine: "Quarantined on expiry",
};

function MovementsTab({ token }: { token: string }) {
  const { state, reload } = useResource(() => facilityApi.movements(token));

  if (state.kind === "loading") return <LoadingCard label="Loading movements…" />;
  if (state.kind === "error") return <ErrorState error={state} onRetry={reload} />;

  const movements = state.data.movements;
  if (movements.length === 0) {
    return (
      <EuEmptyState
        icon={ClipboardList}
        title="No movements recorded"
        description="Every stock report and adjustment you make is written here as an immutable ledger entry."
      />
    );
  }

  return (
    <EuCard className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-[0.8rem] font-semibold text-eu-text">Last {movements.length} movements</p>
        <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Refresh
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[0.8rem]">
          <thead className="bg-eu-surface text-[0.68rem] uppercase tracking-[0.12em] text-eu-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">When</th>
              <th scope="col" className="px-4 py-3 font-semibold">Type</th>
              <th scope="col" className="px-4 py-3 font-semibold">Group / component</th>
              <th scope="col" className="px-4 py-3 font-semibold">Change</th>
              <th scope="col" className="px-4 py-3 font-semibold">Balance after</th>
              <th scope="col" className="px-4 py-3 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-eu-border">
            {movements.map((movement: InventoryMovement) => (
              <tr key={movement.id}>
                <td className="px-4 py-3 text-eu-muted">{absoluteTime(movement.occurredAt)}</td>
                <td className="px-4 py-3 text-eu-text">{MOVEMENT_LABEL[movement.movementType] ?? movement.movementType}</td>
                <td className="px-4 py-3 text-eu-muted">
                  {movement.bloodGroup} · {movement.component}
                </td>
                <td className={cn("px-4 py-3 font-semibold", movement.quantity < 0 ? "text-eu-red-deep" : "text-eu-ok")}>
                  {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity} {movement.unit}
                </td>
                <td className="px-4 py-3 text-eu-muted">{movement.balanceAfter ?? "—"}</td>
                <td className="px-4 py-3 text-eu-muted">{movement.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EuCard>
  );
}

/* ------------------------------------------------------------------ */
/* Expiry                                                              */
/* ------------------------------------------------------------------ */

function ExpiryTab({ token }: { token: string }) {
  const { state, reload } = useResource(() => facilityApi.expiry(token));

  if (state.kind === "loading") return <LoadingCard label="Loading expiry queue…" />;
  if (state.kind === "error") return <ErrorState error={state} onRetry={reload} />;

  const { today, items } = state.data;

  return (
    <div className="space-y-4">
      <EuNotice tone="info" title={`Batches expiring within 45 days of ${today}`}>
        Expiry is calculated from the collection and expiry dates you recorded, never assumed.
      </EuNotice>

      {items.length === 0 ? (
        <EuEmptyState
          icon={Clock3}
          title="Nothing expiring soon"
          description="No batch with a recorded expiry date falls inside the next 45 days."
        />
      ) : (
        <EuCard className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[0.8rem]">
              <thead className="bg-eu-surface text-[0.68rem] uppercase tracking-[0.12em] text-eu-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Group / component</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Units</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Batch</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Expires</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Days left</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-eu-border">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-eu-text">
                      {item.bloodGroup} · {item.component}
                    </td>
                    <td className="px-4 py-3 text-eu-muted">{formatQuantity(item.quantity, item.unit)}</td>
                    <td className="px-4 py-3 font-mono text-[0.74rem] text-eu-muted">{item.batchNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-eu-muted">{absoluteTime(item.expiryDate)}</td>
                    <td className="px-4 py-3 text-eu-text">{item.daysToExpiry ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill
                        label={INVENTORY_STATUS_LABEL[item.effectiveStatus]}
                        tone={INVENTORY_STATUS_TONE[item.effectiveStatus]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EuCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

function RequestsTab({ token }: { token: string }) {
  const { state, reload } = useResource(() => facilityApi.openRequests(token));

  if (state.kind === "loading") return <LoadingCard label="Loading matching requests…" />;
  if (state.kind === "error") return <ErrorState error={state} onRetry={reload} />;

  const { scope, notice, requests } = state.data;

  return (
    <div className="space-y-4">
      <EuNotice tone="info" title={`Requests naming ${scope.city}, ${scope.state}`}>
        {notice}
      </EuNotice>

      {requests.length === 0 ? (
        <EuEmptyState
          icon={Droplets}
          title="No open requests in your area"
          description="MEDIPAL shows a request here only when it names your state or city and is still open."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <RequestRow key={request.reference} token={token} request={request} onProposed={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestRow({
  token,
  request,
  onProposed,
}: {
  token: string;
  request: FacilityOpenRequest;
  onProposed: () => void;
}) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [unitsOffered, setUnitsOffered] = useState("");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const units = Number(unitsOffered);
    if (!Number.isInteger(units) || units < 1) {
      setFieldError("Offer a whole number of units, at least 1.");
      return;
    }
    setFieldError(null);
    void action.run(
      async () => {
        const result = await facilityApi.submitProposal(token, {
          reference: request.reference,
          unitsOffered: units,
          message: message.trim() || undefined,
        });
        return `Proposal for ${request.reference} recorded. The request is now ${REQUEST_STATUS_LABEL[result.requestStatus]}.`;
      },
      () => {
        setUnitsOffered("");
        setMessage("");
        onProposed();
      },
    );
  }

  return (
    <EuCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9rem] font-semibold text-eu-text">
            {request.bloodGroup} · {request.component} · {request.unitsRequired} units required
          </p>
          <p className="mt-0.5 text-[0.78rem] text-eu-muted">
            <span className="font-mono">{request.reference}</span> · {request.city}, {request.state}
            {request.hospitalName ? ` · ${request.hospitalName}` : ""}
          </p>
          <p className="mt-0.5 text-[0.74rem] text-eu-muted">
            {request.priority} · raised {relativeTime(request.createdAt)} · needed by {absoluteTime(request.requiredBy)}
            {request.myProposals > 0 ? ` · you already offered on this request (${request.myProposals})` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusPill label={REQUEST_STATUS_LABEL[request.status]} tone={REQUEST_STATUS_TONE[request.status]} />
          <button type="button" onClick={() => setOpen((value) => !value)} className="eu-btn eu-btn-secondary px-3 py-1.5 text-[0.74rem]">
            {open ? "Cancel" : "Offer units"}
          </button>
        </div>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-eu-border pt-4 sm:grid-cols-[0.8fr_2fr_auto]">
          <Field label="Units you can provide">
            <input className="eu-field" inputMode="numeric" value={unitsOffered} onChange={(e) => setUnitsOffered(e.target.value)} />
          </Field>
          <Field label="Message" hint="Optional note the requester will see.">
            <input className="eu-field" value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={action.busy} className="eu-btn eu-btn-primary gap-1.5 px-3 py-2.5 text-[0.78rem]">
              {action.busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
              Submit offer
            </button>
          </div>
          {fieldError && (
            <p className="eu-field-error sm:col-span-3" role="alert">
              {fieldError}
            </p>
          )}
          {action.message && (
            <div className="sm:col-span-3">
              <ActionFeedback tone={action.tone} message={action.message} />
            </div>
          )}
        </form>
      )}
    </EuCard>
  );
}

/* ------------------------------------------------------------------ */
/* Transfers                                                           */
/* ------------------------------------------------------------------ */

/** Mirrors `TRANSFER_FLOW` in `server/blood.mjs`. */
const TRANSFER_FLOW: Record<string, string[]> = {
  requested: ["approved", "cancelled"],
  approved: ["in_transit", "cancelled"],
  in_transit: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

const TRANSFER_STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};

function TransfersTab({ token }: { token: string }) {
  const { state, reload } = useResource(() => facilityApi.transfers(token));

  return (
    <div className="space-y-5">
      <TransferCreateForm token={token} onCreated={reload} />

      <EuCard className="p-5">
        <EuSectionTitle
          title="Transfers"
          description="Incoming and outgoing movements of units between facilities."
          action={
            <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </button>
          }
        />

        {state.kind === "loading" && <LoadingCard label="Loading transfers…" />}
        {state.kind === "error" && <ErrorState error={state} onRetry={reload} />}
        {state.kind === "ready" &&
          (state.data.transfers.length === 0 ? (
            <EuEmptyState
              className="mt-4"
              icon={Truck}
              title="No transfers yet"
              description="A transfer moves units between two facilities. Dispatching one deducts from your ledger; receiving one adds to the other facility."
            />
          ) : (
            <ul className="mt-4 space-y-3">
              {state.data.transfers.map((transfer) => (
                <TransferRow key={transfer.id} token={token} transfer={transfer} onChanged={reload} />
              ))}
            </ul>
          ))}
      </EuCard>
    </div>
  );
}

function TransferCreateForm({ token, onCreated }: { token: string; onCreated: () => void }) {
  const action = useAction();
  const [toFacilityReference, setToFacilityReference] = useState("");
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(BLOOD_GROUPS[0]);
  const [component, setComponent] = useState<BloodComponent>(BLOOD_COMPONENTS[0]);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reference = toFacilityReference.trim();
    const qty = Number(quantity);
    if (reference.length < 4) {
      setFieldError("Enter the receiving facility's reference, as shown on their console.");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setFieldError("Enter a whole number of units, at least 1.");
      return;
    }
    setFieldError(null);
    void action.run(
      async () => {
        await facilityApi.createTransfer(token, {
          toFacilityReference: reference,
          bloodGroup,
          component,
          quantity: qty,
          notes: notes.trim() || undefined,
        });
        return "Transfer requested. The receiving facility has been notified.";
      },
      () => {
        setToFacilityReference("");
        setQuantity("");
        setNotes("");
        onCreated();
      },
    );
  }

  return (
    <EuCard className="p-5">
      <EuSectionTitle
        title="Request a transfer"
        description="You can only transfer units your facility has recorded as available."
      />
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_1.2fr_0.7fr_auto]">
        <Field label="Receiving facility reference">
          <input className="eu-field font-mono" value={toFacilityReference} onChange={(e) => setToFacilityReference(e.target.value)} />
        </Field>
        <Field label="Blood group">
          <select className="eu-field" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}>
            {BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Component">
          <select className="eu-field" value={component} onChange={(e) => setComponent(e.target.value as BloodComponent)}>
            {BLOOD_COMPONENTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity">
          <input className="eu-field" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <button type="submit" disabled={action.busy} className="eu-btn eu-btn-primary gap-1.5 px-3 py-2.5 text-[0.78rem]">
            {action.busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />}
            Request
          </button>
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <Field label="Notes">
            <input className="eu-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {fieldError && (
          <p className="eu-field-error sm:col-span-2 lg:col-span-5" role="alert">
            {fieldError}
          </p>
        )}
        <div className="sm:col-span-2 lg:col-span-5">
          <ActionFeedback tone={action.tone} message={action.message} />
        </div>
      </form>
    </EuCard>
  );
}

function TransferRow({
  token,
  transfer,
  onChanged,
}: {
  token: string;
  transfer: FacilityTransfer;
  onChanged: () => void;
}) {
  const action = useAction();
  const nextStatuses = TRANSFER_FLOW[transfer.status] ?? [];

  function advance(status: string) {
    void action.run(
      async () => {
        await facilityApi.advanceTransfer(token, { transferId: transfer.id, status });
        return `Transfer marked ${TRANSFER_STATUS_LABEL[status] ?? status}.`;
      },
      onChanged,
    );
  }

  return (
    <li className="rounded-2xl border border-eu-border bg-eu-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9rem] font-semibold text-eu-text">
            {transfer.direction === "outgoing" ? "To" : "From"} {transfer.direction === "outgoing" ? transfer.toFacility : transfer.fromFacility}
          </p>
          <p className="mt-0.5 text-[0.78rem] text-eu-muted">
            {transfer.quantity} {transfer.unit} of {transfer.bloodGroup} {transfer.component} · {transfer.direction}
          </p>
          <p className="mt-0.5 text-[0.74rem] text-eu-muted">
            Requested {relativeTime(transfer.requestedAt)}
            {transfer.dispatchedAt ? ` · dispatched ${relativeTime(transfer.dispatchedAt)}` : ""}
            {transfer.receivedAt ? ` · received ${relativeTime(transfer.receivedAt)}` : ""}
            {transfer.coldChainCode ? ` · cold chain ${transfer.coldChainCode} (${transfer.coldChainStatus})` : ""}
          </p>
        </div>
        <EuBadge tone={transfer.status === "received" ? "ok" : transfer.status === "cancelled" ? "neutral" : "warn"}>
          {TRANSFER_STATUS_LABEL[transfer.status] ?? transfer.status}
        </EuBadge>
      </div>

      {nextStatuses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-eu-border pt-3">
          {nextStatuses.map((status) => (
            <button
              key={status}
              type="button"
              disabled={action.busy}
              onClick={() => advance(status)}
              className={cn(
                "eu-btn px-3 py-1.5 text-[0.74rem]",
                status === "cancelled" ? "eu-btn-quiet text-eu-red-deep" : "eu-btn-secondary",
              )}
            >
              Mark {TRANSFER_STATUS_LABEL[status] ?? status}
            </button>
          ))}
        </div>
      )}

      <ActionFeedback tone={action.tone} message={action.message} />
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Cold chain                                                          */
/* ------------------------------------------------------------------ */

function ColdChainTab({ token }: { token: string }) {
  const { state, reload } = useResource(() => facilityApi.coldChain(token));

  return (
    <div className="space-y-5">
      <ColdChainCreateForm token={token} onCreated={reload} />

      <EuCard className="p-5">
        <EuSectionTitle
          title="Cold-chain passports"
          description="Each passport carries the readings taken during a journey. A reading outside the target range flags an excursion."
          action={
            <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </button>
          }
        />

        {state.kind === "loading" && <LoadingCard label="Loading cold-chain passports…" />}
        {state.kind === "error" && <ErrorState error={state} onRetry={reload} />}
        {state.kind === "ready" &&
          (state.data.passports.length === 0 ? (
            <EuEmptyState
              className="mt-4"
              icon={Thermometer}
              title="No cold-chain passports"
              description="Open a passport before a journey and record each temperature reading as it happens."
            />
          ) : (
            <ul className="mt-4 space-y-3">
              {state.data.passports.map((passport) => (
                <PassportCard key={passport.id} token={token} passport={passport} onChanged={reload} />
              ))}
            </ul>
          ))}
      </EuCard>
    </div>
  );
}

function ColdChainCreateForm({ token, onCreated }: { token: string; onCreated: () => void }) {
  const action = useAction();
  const [targetMin, setTargetMin] = useState("2");
  const [targetMax, setTargetMax] = useState("6");
  const [notes, setNotes] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const min = Number(targetMin);
    const max = Number(targetMax);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setFieldError("Target temperatures must be numbers.");
      return;
    }
    if (max <= min) {
      setFieldError("The maximum must be greater than the minimum.");
      return;
    }
    setFieldError(null);
    void action.run(
      async () => {
        await facilityApi.createPassport(token, {
          targetMinCelsius: min,
          targetMaxCelsius: max,
          notes: notes.trim() || undefined,
        });
        return "Cold-chain passport opened.";
      },
      () => {
        setNotes("");
        onCreated();
      },
    );
  }

  return (
    <EuCard className="p-5">
      <EuSectionTitle
        title="Open a cold-chain passport"
        description="Whole blood and red cells are typically held between 2 °C and 6 °C — set the range your protocol requires."
      />
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[0.7fr_0.7fr_2fr_auto]">
        <Field label="Target min (°C)">
          <input className="eu-field" inputMode="decimal" value={targetMin} onChange={(e) => setTargetMin(e.target.value)} />
        </Field>
        <Field label="Target max (°C)">
          <input className="eu-field" inputMode="decimal" value={targetMax} onChange={(e) => setTargetMax(e.target.value)} />
        </Field>
        <Field label="Notes">
          <input className="eu-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <button type="submit" disabled={action.busy} className="eu-btn eu-btn-primary gap-1.5 px-3 py-2.5 text-[0.78rem]">
            {action.busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
            Open
          </button>
        </div>
        {fieldError && (
          <p className="eu-field-error sm:col-span-4" role="alert">
            {fieldError}
          </p>
        )}
        <div className="sm:col-span-4">
          <ActionFeedback tone={action.tone} message={action.message} />
        </div>
      </form>
    </EuCard>
  );
}

function PassportCard({
  token,
  passport,
  onChanged,
}: {
  token: string;
  passport: ColdChainPassport;
  onChanged: () => void;
}) {
  const action = useAction();
  const [temp, setTemp] = useState("");
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const closed = Boolean(passport.completedAt) || ["completed", "exception_review"].includes(passport.status);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(temp);
    if (!Number.isFinite(value)) {
      setFieldError("Enter the temperature as a number.");
      return;
    }
    setFieldError(null);
    void action.run(
      async () => {
        const result = await facilityApi.addObservation(token, { passportId: passport.id, tempCelsius: value, note: note.trim() || undefined });
        return result.message;
      },
      () => {
        setTemp("");
        setNote("");
        onChanged();
      },
    );
  }

  return (
    <li className="rounded-2xl border border-eu-border bg-eu-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9rem] font-semibold text-eu-text">
            <span className="font-mono">{passport.code}</span>
          </p>
          <p className="mt-0.5 text-[0.78rem] text-eu-muted">
            Target {passport.targetMinCelsius}–{passport.targetMaxCelsius} °C · current{" "}
            {passport.currentTempCelsius ?? "not recorded"} °C · started {relativeTime(passport.startedAt)}
          </p>
          <p className="mt-0.5 text-[0.74rem] text-eu-muted">
            {passport.observationCount} reading(s) · {passport.excursionCount} excursion(s)
          </p>
        </div>
        <EuBadge tone={passport.excursionCount > 0 ? "red" : passport.status === "nominal" ? "ok" : "warn"}>
          {passport.status.replace(/_/g, " ")}
        </EuBadge>
      </div>

      {passport.observations.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-eu-border pt-3">
          {passport.observations.map((observation, index) => (
            <li key={`${observation.recordedAt}-${index}`} className="flex flex-wrap items-center justify-between gap-2 text-[0.76rem]">
              <span className={cn("font-medium", observation.isExcursion ? "text-eu-red-deep" : "text-eu-text")}>
                {observation.tempCelsius} °C {observation.isExcursion ? "· excursion" : ""}
              </span>
              <span className="text-eu-muted">
                {observation.note ?? "no note"} · {absoluteTime(observation.recordedAt)}
                {observation.recordedBy ? ` · ${observation.recordedBy}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {closed ? (
        <p className="mt-3 border-t border-eu-border pt-3 text-[0.76rem] text-eu-muted">
          This passport is closed. No further readings can be recorded against it.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3 grid gap-3 border-t border-eu-border pt-3 sm:grid-cols-[0.6fr_2fr_auto]">
          <Field label="Reading (°C)">
            <input className="eu-field" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} />
          </Field>
          <Field label="Note">
            <input className="eu-field" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={action.busy} className="eu-btn eu-btn-secondary gap-1.5 px-3 py-2.5 text-[0.78rem]">
              {action.busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Thermometer className="h-3.5 w-3.5" aria-hidden />}
              Record
            </button>
          </div>
          {fieldError && (
            <p className="eu-field-error sm:col-span-3" role="alert">
              {fieldError}
            </p>
          )}
          <div className="sm:col-span-3">
            <ActionFeedback tone={action.tone} message={action.message} />
          </div>
        </form>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

function NotificationsTab({ token }: { token: string }) {
  const { state, reload } = useResource(() => facilityApi.notifications(token));

  if (state.kind === "loading") return <LoadingCard label="Loading notifications…" />;
  if (state.kind === "error") return <ErrorState error={state} onRetry={reload} />;

  const notifications = state.data.notifications;
  if (notifications.length === 0) {
    return (
      <EuEmptyState
        icon={Bell}
        title="No notifications"
        description="Approvals, incoming transfers and cold-chain excursions appear here as they happen."
      />
    );
  }

  return (
    <EuCard className="p-5">
      <EuSectionTitle
        title="Notifications"
        action={
          <button type="button" onClick={reload} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
        }
      />
      <ul className="mt-4 space-y-2.5">
        {notifications.map((notification: FacilityNotification) => (
          <NotificationRow key={notification.id} token={token} notification={notification} onChanged={reload} />
        ))}
      </ul>
    </EuCard>
  );
}

function NotificationRow({
  token,
  notification,
  onChanged,
}: {
  token: string;
  notification: FacilityNotification;
  onChanged: () => void;
}) {
  const action = useAction();

  return (
    <li className={cn("rounded-xl border px-3.5 py-3", notification.isRead ? "border-eu-border bg-eu-bg" : "border-[#f6c9c1] bg-[#fdf0ed]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.84rem] font-semibold text-eu-text">{notification.title}</p>
          <p className="mt-0.5 text-[0.78rem] text-eu-muted">{notification.body}</p>
          <p className="mt-0.5 text-[0.72rem] text-eu-muted">
            {notification.type.replace(/_/g, " ")} · {relativeTime(notification.createdAt)}
          </p>
        </div>
        {!notification.isRead && (
          <button
            type="button"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await facilityApi.markNotificationRead(token, notification.id);
                return "Marked as read.";
              }, onChanged)
            }
            className="eu-btn eu-btn-quiet px-2.5 py-1.5 text-[0.74rem]"
          >
            Mark read
          </button>
        )}
      </div>
      <ActionFeedback tone={action.tone} message={action.message} />
    </li>
  );
}
