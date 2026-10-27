import { useState } from "react";
import {
  Thermometer,
  Activity,
  ShieldCheck,
  RefreshCw,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { API_BASE } from "@/services/eupchar/config";
import { LiveNotice, notConfigured, type LiveNoticeMessage } from "./LiveNotice";

interface Shipment {
  id: string;
  trackingId: string;
  component: string;
  tempRange: string;
  currentTemp: string;
  status: "optimal" | "warning" | "critical";
  lastReading: string;
  location: string;
  destination: string;
}

const MOCK_SHIPMENTS: Shipment[] = [
  {
    id: "1",
    trackingId: "PAT-CC-9823",
    component: "Packed Red Blood Cells (4 Units)",
    tempRange: "2°C - 6°C",
    currentTemp: "4.2°C",
    status: "optimal",
    lastReading: "2 mins ago",
    location: "Bailey Road, near Patna Women's College",
    destination: "PMCH Patna"
  },
  {
    id: "2",
    trackingId: "PAT-CC-1044",
    component: "Platelets (2 Units)",
    tempRange: "20°C - 24°C",
    currentTemp: "21.8°C",
    status: "optimal",
    lastReading: "5 mins ago",
    location: "Kankarbagh Flyover",
    destination: "IGIMS Patna"
  }
];

type Health =
  | { status: "idle" | "loading" }
  | { status: "ready"; integrations: Record<string, string>; databaseStatus: string; latencyMs: number | null }
  | { status: "error"; message: string };

function toneFor(value: string): string {
  return value === "live" || value === "configured"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-700";
}

export function LiveColdChain() {
  const [notice, setNotice] = useState<LiveNoticeMessage | null>(null);
  const [health, setHealth] = useState<Health>({ status: "idle" });

  async function checkHealth() {
    setNotice(null);
    if (health.status === "ready" || health.status === "loading") {
      setHealth({ status: "idle" });
      return;
    }
    setHealth({ status: "loading" });
    try {
      const response = await fetch(`${API_BASE}/api/health`, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        setHealth({ status: "error", message: `The status endpoint replied with ${response.status}.` });
        return;
      }
      const payload = (await response.json()) as {
        integrations?: Record<string, string>;
        database?: { status?: string; latencyMs?: number };
      };
      setHealth({
        status: "ready",
        integrations: payload.integrations ?? {},
        databaseStatus: payload.database?.status ?? "unknown",
        latencyMs: typeof payload.database?.latencyMs === "number" ? payload.database.latencyMs : null,
      });
    } catch {
      setHealth({
        status: "error",
        message: "MEDIPAL could not reach its own status endpoint. The server may be offline.",
      });
    }
  }

  return (
    <div className="flex h-full flex-col p-8 bg-white/40 backdrop-blur-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-secondary">
            Transit Intelligence · Illustrative Telemetry
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-content-primary">
            Active Cold-Chain Monitoring &amp; Transit Safety
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setNotice(
                notConfigured(
                  "No live sensor feed is connected",
                  "Temperature telemetry is captured through the cold-chain passport routes (POST /api/blood/facility/cold-chain/observations), which require a verified blood-bank session. Until one is configured there is nothing new to fetch, so the readings below stay as the fixed illustrative sample rather than pretending to refresh.",
                ),
              )
            }
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh Telemetry
          </button>
          <button
            type="button"
            onClick={() => void checkHealth()}
            aria-expanded={health.status === "ready"}
            className="btn-secondary flex items-center gap-2"
          >
            {health.status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Activity className="h-4 w-4" aria-hidden />
            )}
            {health.status === "ready" || health.status === "loading" ? "Hide system status" : "System Health"}
          </button>
        </div>
      </div>

      {notice && (
        <div className="mt-6">
          <LiveNotice message={notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      {health.status === "error" && (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="text-[0.7rem] leading-relaxed">{health.message}</p>
          <button
            type="button"
            onClick={() => void checkHealth()}
            className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold underline"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Retry
          </button>
        </div>
      )}

      {health.status === "ready" && (
        <div className="mt-6 rounded-3xl border border-line bg-white/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-content-secondary/60">
              Deployment integration status (GET /api/health)
            </h3>
            <p className="text-[0.65rem] text-content-secondary">
              Database:{" "}
              <span className="font-bold text-content-primary">{health.databaseStatus}</span>
              {health.latencyMs !== null && <> · {health.latencyMs} ms</>}
            </p>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(health.integrations).map(([key, value]) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3"
              >
                <span className="text-[0.7rem] font-semibold text-content-primary">{key}</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider",
                    toneFor(value),
                  )}
                >
                  {value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {/* Monitoring Cards */}
        <div className="space-y-6">
          <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-content-secondary/60">
            Live Shipments in Network ({MOCK_SHIPMENTS.length})
          </h3>

          {MOCK_SHIPMENTS.map((shipment) => (
            <div
              key={shipment.id}
              className="rounded-3xl border border-line bg-white/70 p-6 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[0.65rem] font-bold text-content-secondary uppercase tracking-widest">{shipment.trackingId}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700 uppercase tracking-wider">
                      Illustrative
                    </span>
                  </div>
                  <h4 className="mt-2 font-display text-base font-bold text-content-primary">{shipment.component}</h4>
                </div>
                <div className="text-right">
                  <div className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold",
                    shipment.status === "optimal" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  )}>
                    <Thermometer className="h-4 w-4" aria-hidden />
                    {shipment.currentTemp}
                  </div>
                  <p className="mt-1 text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-tighter">Sample reading</p>
                </div>
              </div>

              <div className="mt-6 grid gap-6 border-t border-line/50 pt-6 sm:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <p className="text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-widest">Required Range</p>
                    <p className="text-xs font-semibold text-content-primary">{shipment.tempRange}</p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-widest">Last Signal</p>
                    <p className="text-xs font-semibold text-content-primary">{shipment.lastReading}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-widest">Sample Position</p>
                    <p className="text-xs font-semibold text-content-primary truncate">{shipment.location}</p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-widest">Destination</p>
                    <p className="text-xs font-semibold text-content-primary">{shipment.destination}</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setNotice(
                      notConfigured(
                        "No live route to display",
                        "MEDIPAL does not hold a live GPS track for this sample shipment. Position history is recorded by the facility that owns the cold-chain passport, so there is no route to open from this screen.",
                      ),
                    )
                  }
                  className="flex-1 rounded-xl border border-line bg-white px-4 py-2 text-xs font-bold text-content-primary hover:bg-blush-soft transition-colors"
                >
                  View Full Route
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNotice(
                      notConfigured(
                        "Dispatch contact is not published",
                        "No logistics dispatch desk is registered for the Patna network in this deployment, so no number can be dialled. In a live rollout the facility's verified emergency hotline is the contact channel.",
                      ),
                    )
                  }
                  className="flex-1 rounded-xl border border-line bg-white px-4 py-2 text-xs font-bold text-content-primary hover:bg-blush-soft transition-colors"
                >
                  Contact Dispatch
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Global Network Health */}
        <div className="space-y-6">
          <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-content-secondary/60">
            Network Health &amp; Alerts
          </h3>

          <div className="rounded-3xl border border-line bg-white/70 p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                <ShieldCheck className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h4 className="text-sm font-bold text-content-primary uppercase tracking-widest">
                  Illustrative sample only
                </h4>
                <p className="text-xs text-content-secondary">
                  No container in this page is reporting real sensor data. Use System Health to see which
                  integrations this deployment actually has configured.
                </p>
              </div>
            </div>

            <div className="divider-glass my-8" />

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <div>
                  <p className="text-xs font-bold text-content-primary">Telemetry source</p>
                  <p className="mt-0.5 text-[0.65rem] text-content-secondary">
                    Cold-chain readings are written through the authenticated facility passport routes. None are
                    connected to this page yet.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <div>
                  <p className="text-xs font-bold text-content-primary">Gateway monitoring</p>
                  <p className="mt-0.5 text-[0.65rem] text-content-secondary">
                    Signal-strength and hub-count figures would come from the logistics provider's API, which is
                    not integrated.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
