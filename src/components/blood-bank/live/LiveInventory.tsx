import { useState } from "react";
import { 
  Search, 
  Download, 
  ArrowRightLeft, 
  Clock,
  ShieldCheck,
  ExternalLink
} from "lucide-react";

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

export function LiveInventory() {
  const [facility, setFacility] = useState("AIIMS Patna");

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
              Blood Component Inventory & Movement Ledger
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="btn-secondary flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Movement Ledger
            </button>
            <button className="btn-secondary flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Public Mode Banner */}
        <div className="mt-8 flex items-center justify-between rounded-2xl border border-line bg-white px-6 py-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blush-soft text-crimson">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-content-primary">Read-Only Public Review Mode</p>
              <p className="text-xs text-content-secondary">You are currently logged in as a Public Citizen. Direct inventory mutation requires verified blood-bank staff credentials.</p>
            </div>
          </div>
          <button className="rounded-xl bg-content-primary px-5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-black">
            Switch to Staff Persona (Dr. Neha Sharma, AIIMS Patna)
          </button>
        </div>

        {/* Filters */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">Facility</label>
            <select 
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
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">Blood Group</label>
            <select className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-crimson/50">
              <option>All Blood Groups</option>
              <option>O-</option>
              <option>O+</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">Component</label>
            <select className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-crimson/50">
              <option>All Components</option>
              <option>Whole Blood</option>
              <option>Platelets</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">Status</label>
            <select className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium outline-none focus:border-crimson/50">
              <option>All Statuses</option>
              <option>Validated</option>
              <option>Expired</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary/70">Search Batch / Storage</label>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
              <Search className="h-4 w-4 text-content-secondary/40" />
              <input type="text" placeholder="e.g. W26 or Cooler Alpha" className="w-full bg-transparent text-sm outline-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="flex-1 overflow-x-auto p-8">
        <table className="w-full border-separate border-spacing-y-3">
          <thead>
            <tr className="text-left text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-secondary/60">
              <th className="px-6 pb-2">Batch / Product</th>
              <th className="px-6 pb-2">Group</th>
              <th className="px-6 pb-2">Storage Location</th>
              <th className="px-6 pb-2">Available Qty</th>
              <th className="px-6 pb-2">Shelf Expiry</th>
              <th className="px-6 pb-2">Verification</th>
              <th className="px-6 pb-2">Actions</th>
            </tr>
          </thead>
          <tbody className="space-y-4">
            {MOCK_INVENTORY.map((item) => (
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
                      <Clock className="h-3 w-3" />
                      Current Temp: <span className="font-bold text-emerald-600">{item.temperature}</span>
                    </p>
                  </div>
                </td>
                <td className="border-y border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                  <p className="text-lg font-display font-bold text-content-primary">
                    {item.quantity} <span className="text-[0.65rem] font-bold uppercase tracking-normal text-content-secondary/70">{item.unit}</span>
                  </p>
                </td>
                <td className="border-y border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                  <div>
                    <p className="text-[0.7rem] font-bold text-crimson uppercase tracking-wider">Validated Stock</p>
                    <p className="mt-0.5 text-[0.65rem] text-content-secondary">{item.expiryDate}</p>
                  </div>
                </td>
                <td className="border-y border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="text-left">
                      <p className="text-[0.65rem] font-bold text-content-primary">{item.lastVerifiedAt}</p>
                      <p className="text-[0.6rem] text-content-secondary">by {item.lastVerifiedBy}</p>
                    </div>
                  </div>
                </td>
                <td className="rounded-r-2xl border-y border-r border-line bg-white/60 px-6 py-5 backdrop-blur-sm group-hover:bg-white transition-colors">
                  <button className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-wider text-content-secondary hover:text-crimson transition-colors">
                    Read Only
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
