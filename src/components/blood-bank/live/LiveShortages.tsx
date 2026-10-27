import { useState } from "react";
import {
  Clock,
  CheckCircle2,
  ArrowRight,
  Truck,
  FileText,
  History,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { LiveNotice, notConfigured, type LiveNoticeMessage } from "./LiveNotice";

interface ShortageRequest {
  id: string;
  requestId: string;
  priority: "stat" | "urgent" | "normal";
  bloodGroup: string;
  component: string;
  units: number;
  indication: string;
  requestedBy: string;
  supplyingFrom: string;
  status: "in-transit" | "under-review" | "draft";
  createdAt: string;
}

const MOCK_REQUESTS: ShortageRequest[] = [
  {
    id: "1",
    requestId: "#req-patna-001",
    priority: "stat",
    bloodGroup: "O-",
    component: "Packed Red Blood Cells",
    units: 4,
    indication: "Massive transfusion protocol active for multi-vehicle collision victim on Gandhi Setu.",
    requestedBy: "Patna Medical College and Hospital (PMCH)",
    supplyingFrom: "AIIMS Patna",
    status: "in-transit",
    createdAt: "1 hr ago"
  },
  {
    id: "2",
    requestId: "#req-patna-002",
    priority: "urgent",
    bloodGroup: "AB+",
    component: "Platelets",
    units: 2,
    indication: "Emergency coronary artery bypass graft (CABG); patient thrombocyte count < 22,000.",
    requestedBy: "Indira Gandhi Institute of Cardiology (IGIC)",
    supplyingFrom: "Indira Gandhi Institute of Medical Sciences (IGIMS)",
    status: "under-review",
    createdAt: "2 hrs ago"
  }
];

const FACILITY_ACTION_NOTICE = (label: string) =>
  notConfigured(
    `${label} requires a verified facility session`,
    "Inter-facility transfer and receipt actions are served by the authenticated /api/blood/facility/* routes, which are scoped to a blood-bank access token. No facility sign-in is configured for this deployment, so this action cannot be executed here. The token is issued by a MEDIPAL administrator after licence review.",
  );

export function LiveShortages({ onOpenColdChain }: { onOpenColdChain: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<LiveNoticeMessage | null>(null);

  const selected = MOCK_REQUESTS.find((request) => request.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col lg:flex-row bg-white/40 backdrop-blur-sm">
      {/* Shortage Feed */}
      <div className="flex-1 border-r border-line p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-secondary">
              Emergency Logistics · Inter-Facility Coordination
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-content-primary">
              Shortage Requests &amp; Regional Transfers
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenColdChain}
              className="btn-secondary flex items-center gap-2"
            >
              <FileText className="h-4 w-4" aria-hidden />
              Cold-Chain Passport
            </button>
            <button
              type="button"
              onClick={() => setNotice(FACILITY_ACTION_NOTICE("Broadcasting a shortage request"))}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Broadcast Shortage Request
            </button>
          </div>
        </div>

        {notice && (
          <div className="mt-6">
            <LiveNotice message={notice} onDismiss={() => setNotice(null)} />
          </div>
        )}

        <div className="mt-10">
          <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-content-secondary/60">
            Active Regional Shortage Pipeline ({MOCK_REQUESTS.length})
          </h3>

          <div className="mt-6 space-y-6">
            {MOCK_REQUESTS.map((request) => (
              <div
                key={request.id}
                className={cn(
                  "group relative rounded-2xl border bg-white/70 p-6 shadow-sm transition-all hover:shadow-md",
                  selectedId === request.id ? "border-crimson ring-1 ring-crimson/10" : "border-line",
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "rounded-lg px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-widest",
                      request.priority === "stat" ? "bg-crimson text-white" : "bg-amber-100 text-amber-700"
                    )}>
                      {request.priority === "stat" ? "Stat Emergency" : "Urgent"}
                    </span>
                    <span className="text-[0.7rem] font-medium text-content-secondary/60">{request.requestId}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[0.65rem] font-bold text-content-secondary uppercase tracking-wider">
                    {request.status === "in-transit" ? (
                      <>
                        <Truck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                        In Transit
                      </>
                    ) : (
                      <>
                        <Clock className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                        Under Review
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="font-display text-lg font-bold text-content-primary">
                    {request.units} Units of {request.bloodGroup} {request.component}
                  </h4>
                  <div className="mt-3 rounded-xl border border-line bg-blush-soft/30 p-4">
                    <p className="text-xs leading-relaxed text-content-secondary italic">
                      Indication: {request.indication}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-line/50 pt-6">
                  <div className="flex flex-col gap-1">
                    <p className="text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-widest">Requested by</p>
                    <p className="text-xs font-semibold text-content-primary">{request.requestedBy}</p>
                  </div>

                  <div className="hidden sm:block">
                    <ArrowRight className="h-4 w-4 text-content-secondary/30" aria-hidden />
                  </div>

                  <div className="flex flex-col gap-1 sm:text-right">
                    <p className="text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-widest">Supplying from</p>
                    <p className="text-xs font-semibold text-content-primary">{request.supplyingFrom}</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setSelectedId(request.id)}
                    className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-bold text-content-primary transition-colors hover:bg-blush-soft"
                  >
                    Inspect traceability
                  </button>

                  {request.status === "in-transit" && (
                    <button
                      type="button"
                      onClick={() => setNotice(FACILITY_ACTION_NOTICE("Confirming receipt and reconciliation"))}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      Confirm Receipt &amp; Reconcile
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Timeline */}
      <div className="w-full lg:w-[400px] p-8 bg-white/20">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-content-secondary/50" aria-hidden />
          <h3 className="text-[0.7rem] font-bold uppercase tracking-widest text-content-primary">Traceability Audit Timeline</h3>
        </div>

        {selected ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border border-line bg-white/70 p-5">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-content-secondary/60">
                Request
              </p>
              <p className="mt-1 text-sm font-bold text-content-primary">{selected.requestId}</p>
              <p className="mt-1 text-xs text-content-secondary">
                {selected.units} units · {selected.bloodGroup} {selected.component}
              </p>
              <p className="mt-1 text-[0.65rem] text-content-secondary">
                Raised {selected.createdAt} · status {selected.status.replace("-", " ")}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-amber-900">
                No audit events recorded
              </p>
              <p className="mt-1 text-[0.7rem] leading-relaxed text-amber-900/90">
                This page shows an illustrative scenario, and the chain-of-custody log lives on the
                authenticated facility routes. An empty timeline means nothing has been recorded — it does not
                mean a transfer is under way.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="btn-secondary w-full"
            >
              Clear selection
            </button>
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center justify-center gap-6 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-white/50 text-content-secondary/30">
              <Search className="h-8 w-8" aria-hidden />
            </div>
            <div className="max-w-[240px]">
              <p className="text-sm font-medium text-content-secondary">
                Select a shortage request to inspect its end-to-end chain of custody and audit log.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
