import { useMemo, useState } from "react";
import {
  Search,
  Download,
  ArrowRightLeft,
  Clock,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { LiveNotice, notConfigured, type LiveNoticeMessage } from "./LiveNotice";

interface InventoryItem {
  id: string;
  batchId: string;
  bloodGroup: string;
  component: string;
  quantity: number;
  unit: string;
  storageLocation: string;
  temperature: string;
  expiryDate: string;
  verificationStatus: "validated" | "pending" | "expired";
  lastVerifiedBy: string;
  lastVerifiedAt: string;
}

const MOCK_INVENTORY: InventoryItem[] = [
  {
    id: "1",
    batchId: "BR-PAT-2026-AIIMS-679",
    bloodGroup: "O-",
    component: "Packed Red Blood Cells",
    quantity: 7,
    unit: "Units",
    storageLocation: "Packed Cells Refrigerator Chamber #1",
    temperature: "4.1°C",
    expiryDate: "11/18/2026",
    verificationStatus: "validated",
    lastVerifiedBy: "Dr. Neha Sharma",
    lastVerifiedAt: "3 hrs ago"
  },
  {
    id: "2",
    batchId: "BR-PAT-2026-AIIMS-356",
    bloodGroup: "O-",
    component: "Whole Blood",
    quantity: 7,
    unit: "Units",
    storageLocation: "Whole Blood Storage Unit",
    temperature: "3.9°C",
    expiryDate: "11/17/2026",
    verificationStatus: "validated",
    lastVerifiedBy: "Dr. Neha Sharma",
    lastVerifiedAt: "1 hr ago"
  },
  {
    id: "3",
    batchId: "BR-PAT-2026-AIIMS-923",
    bloodGroup: "O-",
    component: "Platelets",
    quantity: 3,
    unit: "Units",
    storageLocation: "Flatbed Agitator Incubator #2",
    temperature: "22.0°C",
    expiryDate: "10/27/2026",
    verificationStatus: "validated",
    lastVerifiedBy: "Dr. Neha Sharma",
    lastVerifiedAt: "1 hr ago"
  }
];

const BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"] as const;
const COMPONENTS = ["Packed Red Blood Cells", "Whole Blood", "Platelets", "Plasma"] as const;
const STATUSES = ["validated", "pending", "expired"] as const;

function downloadCsv(rows: InventoryItem[]) {
  const header = [
    "Batch reference",
    "Blood group",
    "Component",
    "Quantity",
    "Unit",
    "Storage location",
    "Temperature",
    "Expiry",
    "Verification",
  ];
  const body = rows.map((row) => [
    row.batchId,
    row.bloodGroup,
    row.component,
    String(row.quantity),
    row.unit,
    row.storageLocation,
    row.temperature,
    row.expiryDate,
    row.verificationStatus,
  ]);
  const csv = [header, ...body]
    .map((columns) => columns.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `medipal-live-inventory-illustrative-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function LiveInventory() {
  const [facility, setFacility] = useState("AIIMS Patna");
  const [bloodGroup, setBloodGroup] = useState("all");
  const [component, setComponent] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<LiveNoticeMessage | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return MOCK_INVENTORY.filter((item) => {
      if (bloodGroup !== "all" && item.bloodGroup !== bloodGroup) return false;
      if (component !== "all" && item.component !== component) return false;
      if (status !== "all" && item.verificationStatus !== status) return false;
      if (needle) {
        const haystack = `${item.batchId} ${item.component} ${item.storageLocation}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [bloodGroup, component, status, query]);

  const filtered = bloodGroup !== "all" || component !== "all" || status !== "all" || query.trim() !== "";

  function reset() {
    setBloodGroup("all");
    setComponent("all");
    setStatus("all");
    setQuery("");
  }

  return (
    <div className="flex flex-col h-full bg-white/40 backdrop-blur-sm">
      {/* Inventory Header */}
      <div className="border-b border-line bg-white/60 p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-secondary">
              Facility Operations · Validated Ledger Engine
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-content-primary">
              Blood Component Inventory &amp; Movement Ledger
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setNotice(
                  notConfigured(
                    "Movement ledger requires facility credentials",
                    "The batch movement history is served by GET /api/blood/facility/movements, which is scoped to a verified blood-bank account. Sign-in is not configured for this deployment, so the ledger is unavailable here. A MEDIPAL administrator issues the one-time facility token after licence review.",
                  ),
                )
              }
              className="btn-secondary flex items-center gap-2"
            >
              <ArrowRightLeft className="h-4 w-4" aria-hidden />
              Movement Ledger
            </button>
            <button
              type="button"
              onClick={() => {
                downloadCsv(visible);
                setNotice({
                  id: "csv-export",
                  tone: "info",
                  title: `Exported ${visible.length} row${visible.length === 1 ? "" : "s"}`,
                  body:
                    "The CSV was generated in your browser from the illustrative dataset shown on this page. It is not a report of real hospital stock and must not be used for clinical or regulatory decisions.",
                });
              }}
              disabled={visible.length === 0}
              className="btn-secondary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </button>
          </div>
        </div>

        {/* Public Mode Banner */}
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-line bg-white px-6 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blush-soft text-crimson">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-content-primary">Read-Only Public Review Mode</p>
              <p className="text-xs text-content-secondary">
                You are viewing the illustrative ledger as a public citizen. Direct inventory mutation
                requires verified blood-bank staff credentials.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setNotice(
                notConfigured(
                  "Staff sign-in is not configured",
                  "Switching persona needs a facility access token minted by a MEDIPAL administrator after licence verification. No demo password is issued and no privileged session can be started from this screen.",
                ),
              )
            }
            className="shrink-0 rounded-xl bg-content-primary px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-black"
          >
            Request staff access
          </button>
        </div>

        {notice && (
          <div className="mt-6">
            <LiveNotice message={notice} onDismiss={() => setNotice(null)} />
          </div>
        )}

        {/* Filters */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <label htmlFor="inv-facility" className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">
              Facility
            </label>
            <select
              id="inv-facility"
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-crimson/50"
            >
              <option>AIIMS Patna</option>
              <option>PMCH Patna</option>
              <option>IGIMS Patna</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-group" className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">
              Blood Group
            </label>
            <select
              id="inv-group"
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-crimson/50"
            >
              <option value="all">All Blood Groups</option>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-component" className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">
              Component
            </label>
            <select
              id="inv-component"
              value={component}
              onChange={(e) => setComponent(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-crimson/50"
            >
              <option value="all">All Components</option>
              {COMPONENTS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-status" className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">
              Verification
            </label>
            <select
              id="inv-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-crimson/50"
            >
              <option value="all">All Statuses</option>
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item[0].toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-search" className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">
              Search Batch / Storage
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
              <Search className="h-4 w-4 text-content-secondary/40" aria-hidden />
              <input
                id="inv-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. AIIMS-679 or Chamber"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[0.7rem] text-content-secondary">
          <span>
            Showing <span className="font-bold text-content-primary">{visible.length}</span> of{" "}
            {MOCK_INVENTORY.length} batches at {facility}.
          </span>
          {filtered && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 font-semibold text-crimson hover:underline"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="flex-1 overflow-x-auto p-8">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-line bg-white/60 p-10 text-center">
            <p className="text-sm font-semibold text-content-primary">No batches match those filters</p>
            <p className="mt-1 text-xs text-content-secondary">
              Widen the blood group, component or verification filter, or clear the search text.
            </p>
            <button type="button" onClick={reset} className="btn-secondary mt-4">
              Clear filters
            </button>
          </div>
        ) : (
          <table className="w-full min-w-[900px] border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-secondary/60">
                <th className="px-6 pb-2">Batch / Product</th>
                <th className="px-6 pb-2">Group</th>
                <th className="px-6 pb-2">Storage Location</th>
                <th className="px-6 pb-2">Available Qty</th>
                <th className="px-6 pb-2">Shelf Expiry</th>
                <th className="px-6 pb-2">Verification</th>
                <th className="px-6 pb-2">Access</th>
              </tr>
            </thead>
            <tbody className="space-y-4">
              {visible.map((item) => (
                <tr key={item.id} className="group relative">
                  <td className="rounded-l-2xl border-y border-l border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                    <div>
                      <p className="text-xs font-bold text-content-primary">{item.batchId}</p>
                      <p className="mt-0.5 text-[0.65rem] text-content-secondary">{item.component}</p>
                    </div>
                  </td>
                  <td className="border-y border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                    <span className="font-display text-lg font-bold text-crimson-soft">{item.bloodGroup}</span>
                  </td>
                  <td className="border-y border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                    <div>
                      <p className="text-[0.7rem] font-medium text-content-primary">{item.storageLocation}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[0.65rem] text-content-secondary">
                        <Clock className="h-3 w-3" aria-hidden />
                        Current Temp: <span className="font-bold text-emerald-600">{item.temperature}</span>
                      </p>
                    </div>
                  </td>
                  <td className="border-y border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                    <p className="text-lg font-display font-bold text-content-primary">
                      {item.quantity}{" "}
                      <span className="text-[0.65rem] font-bold uppercase tracking-normal text-content-secondary/70">
                        {item.unit}
                      </span>
                    </p>
                  </td>
                  <td className="border-y border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                    <div>
                      <p className="text-[0.7rem] font-bold text-crimson uppercase tracking-wider">Validated Stock</p>
                      <p className="mt-0.5 text-[0.65rem] text-content-secondary">{item.expiryDate}</p>
                    </div>
                  </td>
                  <td className="border-y border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                    <div className="text-left">
                      <p className="text-[0.65rem] font-bold text-content-primary">{item.lastVerifiedAt}</p>
                      <p className="text-[0.6rem] text-content-secondary">by {item.lastVerifiedBy}</p>
                    </div>
                  </td>
                  <td className="rounded-r-2xl border-y border-r border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                    <span className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary">
                      Read only
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
