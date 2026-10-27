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
import {
  LIVE_FRESHNESS_DOT,
  LIVE_FRESHNESS_LABEL,
} from "@/lib/blood/presentation";
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
                  Bihar · Reported availability from centres that publish it
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
              
              <button
                type="button"
                onClick={() => setActiveTab("find")}
                className="btn-primary ml-2 whitespace-nowrap"
              >
                Find Blood
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
            {activeTab === "shortages" && (
              <LiveShortages onOpenColdChain={() => setActiveTab("cold-chain")} />
            )}
            {activeTab === "cold-chain" && <LiveColdChain />}
            {activeTab === "register" && <LiveRegisterHub />}
          </div>
        </Reveal>
      </div>

      {/* Freshness legend (§5) + honesty statement (§28) */}
      <div className="section-shell mt-8">
        <Reveal delay={0.2}>
          <div className="rounded-2xl border border-line bg-white/50 px-6 py-4 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {(["LIVE", "RECENT", "STALE", "OUTDATED", "UNKNOWN"] as const).map((level) => (
                <div key={level} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      LIVE_FRESHNESS_DOT[level],
                      level === "LIVE" && "animate-pulse",
                    )}
                  />
                  <span className="text-xs font-medium uppercase tracking-wider text-content-secondary">
                    {LIVE_FRESHNESS_LABEL[level]}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-line pt-3 text-[0.7rem] leading-relaxed text-content-secondary">
              Reported availability, not a reservation. MEDIPAL shows a figure as{" "}
              <span className="font-semibold text-content-primary">LIVE</span> only when an
              authorised feed observed it in the last 30 minutes. Please call the blood centre to
              confirm before travelling.
            </p>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
