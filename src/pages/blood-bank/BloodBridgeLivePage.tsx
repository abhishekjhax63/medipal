import { useState } from "react";
import { 
  Search, 
  Database, 
  AlertCircle, 
  Thermometer, 
  PlusCircle, 
  MapPin,
  LayoutDashboard
} from "lucide-react";
import { cn } from "@/lib/cn";
import { LiveFindBlood } from "@/components/blood-bank/live/LiveFindBlood";
import { LiveInventory } from "@/components/blood-bank/live/LiveInventory";
import { LiveShortages } from "@/components/blood-bank/live/LiveShortages";
import { LiveColdChain } from "@/components/blood-bank/live/LiveColdChain";
import { LiveRegisterHub } from "@/components/blood-bank/live/LiveRegisterHub";
import { Reveal } from "@/components/ui/Reveal";

type Tab = "find" | "inventory" | "shortages" | "cold-chain" | "register";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "find", label: "Find Blood", icon: Search },
  { id: "inventory", label: "Inventory", icon: Database },
  { id: "shortages", label: "Shortages", icon: AlertCircle },
  { id: "cold-chain", label: "Cold-Chain", icon: Thermometer },
  { id: "register", label: "Register Hub", icon: PlusCircle },
];

export default function BloodBridgeLivePage() {
  const [activeTab, setActiveTab] = useState<Tab>("find");

  return (
    <main className="relative min-h-screen pt-24 pb-20">
      {/* Patna Context Header */}
      <div className="section-shell mb-8">
        <Reveal>
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-crimson/20 bg-blush shadow-glow-red-sm">
                <LayoutDashboard className="h-6 w-6 text-crimson-bright" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-content-primary sm:text-3xl">
                  BloodBridge <span className="text-crimson">Live</span>
                </h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-content-secondary">
                  <MapPin className="h-3.5 w-3.5 text-crimson" />
                  Patna Healthcare Grid · Real-time Coordination
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto pb-2 md:pb-0">
              <div className="flex rounded-2xl border border-line bg-white/50 p-1 backdrop-blur-md">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300",
                      activeTab === tab.id
                        ? "bg-white text-crimson shadow-sm shadow-black/5"
                        : "text-content-secondary hover:text-content-primary"
                    )}
                  >
                    <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-crimson" : "text-content-secondary/70")} />
                    {tab.label}
                  </button>
                ))}
              </div>
              
              <button className="btn-primary ml-2 whitespace-nowrap">
                Find Blood Near Me
              </button>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Main Content Area */}
      <div className="section-shell">
        <Reveal delay={0.1}>
          <div className="glass-panel min-h-[600px] overflow-hidden rounded-3xl border border-line">
            {activeTab === "find" && <LiveFindBlood />}
            {activeTab === "inventory" && <LiveInventory />}
            {activeTab === "shortages" && <LiveShortages />}
            {activeTab === "cold-chain" && <LiveColdChain />}
            {activeTab === "register" && <LiveRegisterHub />}
          </div>
        </Reveal>
      </div>

      {/* Patna Network Status Banner */}
      <div className="section-shell mt-8">
        <Reveal delay={0.2}>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white/50 px-6 py-4 backdrop-blur-md">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-xs font-medium text-content-secondary uppercase tracking-wider">Recently verified (&lt;4h)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                <span className="text-xs font-medium text-content-secondary uppercase tracking-wider">Update due (4-12h)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-crimson shadow-[0_0_8px_rgba(233,30,77,0.5)]" />
                <span className="text-xs font-medium text-content-secondary uppercase tracking-wider">Stale / Unconfirmed</span>
              </div>
            </div>
            <p className="text-[0.7rem] font-medium text-crimson uppercase tracking-[0.1em]">
              DEMO DATA — NOT LIVE HOSPITAL INVENTORY
            </p>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
