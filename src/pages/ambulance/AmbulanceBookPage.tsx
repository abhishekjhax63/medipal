/**
 * Ambulance — booking page.
 *
 * Wraps the booking workflow with a compact emergency strip so the safety
 * numbers are never more than a glance away while the form is being filled.
 */

import { Link, useSearchParams } from "react-router-dom";
import { Ambulance, ArrowLeft, Search } from "lucide-react";
import { AmbulanceEmergencyPanel } from "@/components/ambulance/AmbulanceEmergencyPanel";
import { AmbulanceBookingWizard } from "@/components/ambulance/AmbulanceBookingWizard";
import { AMBULANCE_CATEGORIES, type AmbulanceCategory } from "@/services/ambulance/types";

function readCategory(value: string | null): AmbulanceCategory | null {
  if (!value) return null;
  return (AMBULANCE_CATEGORIES as readonly string[]).includes(value) ? (value as AmbulanceCategory) : null;
}

export default function AmbulanceBookPage() {
  const [params] = useSearchParams();
  const initialCategory = readCategory(params.get("category"));

  return (
    <main className="section-shell pt-12 pb-20 sm:pt-14">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/ambulance"
            className="inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-content-secondary transition-colors hover:text-crimson-soft"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Ambulance
          </Link>
          <h1 className="mt-2 flex items-center gap-3 font-display text-3xl font-semibold tracking-[-0.02em] text-content-primary">
            <Ambulance className="h-7 w-7 text-crimson-bright" aria-hidden />
            Request an ambulance
          </h1>
        </div>
        <Link to="/ambulance/track" className="btn-secondary px-4 py-2 text-[0.8rem]">
          <Search className="h-3.5 w-3.5" aria-hidden />
          Track a request
        </Link>
      </div>

      <AmbulanceEmergencyPanel className="mb-8" />

      <AmbulanceBookingWizard initialCategory={initialCategory} />
    </main>
  );
}
