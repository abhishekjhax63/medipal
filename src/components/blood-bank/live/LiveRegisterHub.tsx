import { useState } from "react";
import { 
  Building2, 
  MapPin, 
  ShieldCheck, 
  CheckCircle2,
  Navigation,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/cn";

export function LiveRegisterHub() {
  const [step, setStep] = useState(1);

  return (
    <div className="flex flex-col h-full bg-white/40 backdrop-blur-sm">
      <div className="border-b border-line bg-white/60 p-8">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-crimson">
          Patna Network Facility Enrollment
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-content-primary">
          Register Hospital Blood Bank or Transfusion Depot
        </h2>
        <p className="mt-2 text-sm text-content-secondary max-w-2xl">
          Hospitals and transfusion centers in Patna, Danapur, and Bihta can enroll to coordinate regional shortages, manage live inventory, and track cold-chain deliveries.
        </p>
      </div>

      <div className="flex-1 p-8">
        <div className="mx-auto max-w-3xl">
          {/* Progress Steps */}
          <div className="mb-10 flex items-center justify-between px-4">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 font-bold text-xs transition-all",
                  step === s ? "border-crimson bg-crimson text-white" : 
                  step > s ? "border-crimson bg-crimson/10 text-crimson" : "border-line bg-white text-content-secondary/40"
                )}>
                  {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                </div>
                {s < 4 && (
                  <div className={cn(
                    "h-[2px] w-12 sm:w-20 mx-2",
                    step > s ? "bg-crimson/30" : "bg-line"
                  )} />
                )}
              </div>
            ))}
          </div>

          {/* Form Sections */}
          <div className="rounded-3xl border border-line bg-white/70 p-8 shadow-sm">
            {step === 1 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <Building2 className="h-5 w-5 text-crimson" />
                  <h3 className="text-[0.7rem] font-bold uppercase tracking-widest text-content-primary">1. Hospital / Blood Center Identification</h3>
                </div>
                
                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-content-primary">Official Facility Legal Name *</label>
                    <input type="text" placeholder="e.g. Paras HMRI Hospital Blood Bank" className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors" />
                  </div>
                  
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-content-primary">Facility Category *</label>
                      <select className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors">
                        <option>Hospital Blood Bank</option>
                        <option>Regional Blood Center</option>
                        <option>Transfusion Depot</option>
                        <option>Stand-alone Blood Bank</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-content-primary">Operating Schedule *</label>
                      <input type="text" placeholder="24/7 Emergency Transfusion Service" className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <Navigation className="h-5 w-5 text-crimson" />
                  <h3 className="text-[0.7rem] font-bold uppercase tracking-widest text-content-primary">2. Patna Location & Map Coordinates</h3>
                </div>
                
                <div className="grid gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-content-primary">Street Address & Locality *</label>
                    <input type="text" placeholder="e.g. Bailey Road, Sheikhpura or Ashok Rajpath" className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors" />
                  </div>
                  
                  <div className="grid gap-6 sm:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-content-primary">Patna Locality *</label>
                      <input type="text" placeholder="e.g. Kankarbagh" className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-content-primary">PIN Code *</label>
                      <input type="text" maxLength={6} placeholder="8000XX" className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-crimson/50 transition-colors" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-content-primary">Coordinates (Lat / Lng)</label>
                      <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-3">
                        <MapPin className="h-4 w-4 text-content-secondary/30" />
                        <input type="text" placeholder="Auto-detect or manual" className="w-full bg-transparent text-sm outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Nav Buttons */}
            <div className="mt-10 flex items-center justify-between border-t border-line pt-8">
              <button 
                onClick={() => setStep(s => Math.max(1, s - 1))}
                className={cn(
                  "px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-content-secondary transition-colors hover:text-crimson",
                  step === 1 && "invisible"
                )}
              >
                Back
              </button>
              
              <button 
                onClick={() => setStep(s => Math.min(4, s + 1))}
                className="btn-primary group"
              >
                {step === 4 ? "Submit Registration" : "Next Section"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          <div className="mt-8 flex items-start gap-4 rounded-2xl border border-line bg-white/30 p-5">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-xs font-bold text-content-primary uppercase tracking-widest">Verification Protocol</p>
              <p className="mt-1 text-[0.65rem] leading-relaxed text-content-secondary">
                Submitted facilities are reviewed by the MEDIPAL regional administrator. Verification status and dashboard access are granted only after physical location audit and license validation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
