import { 
  Thermometer, 
  Activity,
  ShieldCheck,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/cn";

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

export function LiveColdChain() {
  return (
    <div className="flex h-full flex-col p-8 bg-white/40 backdrop-blur-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-secondary">
            Transit Intelligence · Real-time Telemetry
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-content-primary">
            Active Cold-Chain Monitoring & Transit Safety
          </h2>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh Telemetry
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Health
          </button>
        </div>
      </div>

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
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700 uppercase tracking-wider">Live Tracking</span>
                  </div>
                  <h4 className="mt-2 font-display text-base font-bold text-content-primary">{shipment.component}</h4>
                </div>
                <div className="text-right">
                  <div className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold",
                    shipment.status === "optimal" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  )}>
                    <Thermometer className="h-4 w-4" />
                    {shipment.currentTemp}
                  </div>
                  <p className="mt-1 text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-tighter">Current Telemetry</p>
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
                    <p className="text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-widest">Current Position</p>
                    <p className="text-xs font-semibold text-content-primary truncate">{shipment.location}</p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] font-bold text-content-secondary/60 uppercase tracking-widest">Destination</p>
                    <p className="text-xs font-semibold text-content-primary">{shipment.destination}</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button className="flex-1 rounded-xl border border-line bg-white px-4 py-2 text-xs font-bold text-content-primary hover:bg-blush-soft transition-colors">
                  View Full Route
                </button>
                <button className="flex-1 rounded-xl border border-line bg-white px-4 py-2 text-xs font-bold text-content-primary hover:bg-blush-soft transition-colors">
                  Contact Dispatch
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Global Network Health */}
        <div className="space-y-6">
          <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-content-secondary/60">
            Network Health & Alerts
          </h3>

          <div className="rounded-3xl border border-line bg-white/70 p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-content-primary uppercase tracking-widest">Cold-Chain Secure</h4>
                <p className="text-xs text-content-secondary">All active containers in the Patna network are reporting within optimal clinical thresholds.</p>
              </div>
            </div>

            <div className="divider-glass my-8" />

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <div>
                  <p className="text-xs font-bold text-content-primary">System Refresh</p>
                  <p className="mt-0.5 text-[0.65rem] text-content-secondary">Telemetry updated successfully across 14 connected hubs.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <div>
                  <p className="text-xs font-bold text-content-primary">Gateway Connected</p>
                  <p className="mt-0.5 text-[0.65rem] text-content-secondary">Transit-Node-Patna-East is reporting stable signal strength (98%).</p>
                </div>
              </div>
            </div>

            <div className="mt-10 rounded-2xl bg-blush-soft p-5 text-center">
              <p className="text-[0.65rem] font-bold text-crimson uppercase tracking-widest">Sensor Integration Active</p>
              <p className="mt-2 text-[0.6rem] text-content-secondary leading-relaxed">
                Temperature readings are sourced from verified IoT sensors integrated via the MEDIPAL logistics proxy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
