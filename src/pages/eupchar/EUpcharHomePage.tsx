import { useMemo, useState } from "react";
import {
  Building2,
  CalendarCheck,
  ChevronRight,
  FileText,
  MapPin,
  Microscope,
  PackageCheck,
  ScanLine,
  Search,
  Stethoscope,
  Upload,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { EuDatasetNote, EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuCard, EuReveal, EuSectionTitle, EuStagger, EuStaggerItem } from "@/components/eupchar/ui";
import { PracticeModeExplainer, PracticeModeToggle } from "@/components/eupchar/PracticeModeToggle";
import { selectGlobalSuggestions, selectLocationSelection } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { hospitalDatasetMeta } from "@/data/eupchar/directory";
import { E_UPCHAR_COPY } from "@/types/eupchar";

type ActionCard = {
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
};

/** The eight homepage actions — each routes to a real, existing screen. */
const actions: readonly ActionCard[] = [
  {
    label: "Doctor Appointments",
    description: "Find a hospital and book a consultation slot.",
    to: "/e-upchar/hospitals?category=doctor-appointment",
    icon: Stethoscope,
  },
  {
    label: "Scans & Imaging",
    description: "CT, MRI, ultrasound, X-ray and more.",
    to: "/e-upchar/hospitals?group=imaging",
    icon: ScanLine,
  },
  {
    label: "Lab Tests",
    description: "Blood, urine and other laboratory investigations.",
    to: "/e-upchar/hospitals?group=laboratory",
    icon: Microscope,
  },
  {
    label: "Health Checkup Packages",
    description: "Preventive packages where a hospital lists them.",
    to: "/e-upchar/hospitals?category=checkup-package",
    icon: PackageCheck,
  },
  {
    label: "Prescription Booking",
    description: "Start a booking from a doctor's prescription.",
    to: "/e-upchar/prescription",
    icon: Upload,
  },
  {
    label: "My Appointments",
    description: "Track upcoming, completed and cancelled bookings.",
    to: "/e-upchar/appointments",
    icon: CalendarCheck,
  },
  {
    label: "My Patients",
    description: "Save the people you book for, with consent.",
    to: "/e-upchar/patients",
    icon: Users,
  },
  {
    label: "My Reports",
    description: "Diagnostic reports once a hospital supplies them.",
    to: "/e-upchar/reports",
    icon: FileText,
  },
];

export default function EUpcharHomePage() {
  const state = useEuState();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const selection = selectLocationSelection(state);
  const suggestions = useMemo(() => selectGlobalSuggestions(query, state), [query, state]);

  return (
    <EuShell>
      <EuPageHeader
        eyebrow="E-UPCHAR"
        title="Your Healthcare, Simplified."
        description="Discover hospitals, explore available services, and manage your healthcare bookings in one place."
        actions={<PracticeModeToggle />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <EuReveal>
          <div className="space-y-4">
            <div className="relative">
              <label className="eu-label" htmlFor="eupchar-search">
                Search
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-eu-muted"
                  aria-hidden
                />
                <input
                  id="eupchar-search"
                  className="eu-field pl-11"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={E_UPCHAR_COPY.searchPlaceholder}
                  autoComplete="off"
                />
              </div>

              {suggestions.length > 0 && (
                <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-eu-border bg-eu-bg shadow-eu-lift">
                  {suggestions.map((suggestion, index) =>
                    suggestion.kind === "hospital" ? (
                      <li key={`h-${suggestion.hospital.id}`}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-eu-surface"
                          onClick={() => {
                            setQuery("");
                            navigate(`/e-upchar/hospitals/${suggestion.hospital.id}`);
                          }}
                        >
                          <Building2 className="h-4 w-4 shrink-0 text-eu-muted" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-eu-text">
                              {suggestion.hospital.name}
                            </span>
                            <span className="block text-[0.72rem] text-eu-muted">
                              {suggestion.hospital.district}, {suggestion.hospital.state}
                            </span>
                          </span>
                        </button>
                      </li>
                    ) : (
                      <li key={`s-${suggestion.service}-${index}`}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-eu-surface"
                          onClick={() => {
                            setQuery("");
                            navigate(`/e-upchar/hospitals?q=${encodeURIComponent(suggestion.service)}`);
                          }}
                        >
                          <Microscope className="h-4 w-4 shrink-0 text-eu-muted" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-eu-text">
                              {suggestion.service}
                            </span>
                            <span className="block text-[0.72rem] text-eu-muted">
                              {suggestion.category} · search hospitals
                            </span>
                          </span>
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>

            <PracticeModeExplainer />
          </div>
        </EuReveal>

        <EuReveal delay={0.08}>
          <EuCard className="flex h-full flex-col justify-between p-5">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-eu-red" aria-hidden />
                <h2 className="text-[0.95rem] font-semibold text-eu-text">Your location</h2>
              </div>
              {selection ? (
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-medium text-eu-text">
                    {selection.hospitalId ? "Hospital selected" : selection.district ?? "District selected"}
                  </p>
                  <p className="text-[0.8rem] text-eu-muted">
                    {selection.state}
                    {selection.district ? ` · ${selection.district}` : ""}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-eu-muted">
                  Choose a state, district and hospital so E-UPCHAR shows the right services and
                  prices. Your choice is remembered on this device.
                </p>
              )}
            </div>
            <Link
              to="/e-upchar/location"
              className="eu-btn eu-btn-primary mt-5 justify-center gap-1.5 px-4 py-2.5"
            >
              {selection ? "Change location" : "Select Location"}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </EuCard>
        </EuReveal>
      </div>

      <section className="mt-12">
        <EuSectionTitle
          title="What would you like to do?"
          description="Every option below opens a working screen — nothing here is a placeholder link."
        />
        <EuStagger className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((action) => (
            <EuStaggerItem key={action.label} className="h-full">
              <Link to={action.to} className="block h-full">
                <EuCard interactive className="flex h-full flex-col gap-3 p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-eu-border bg-eu-surface text-eu-red">
                    <action.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-[0.95rem] font-semibold leading-snug text-eu-text">
                    {action.label}
                  </span>
                  <span className="text-[0.82rem] leading-relaxed text-eu-muted">
                    {action.description}
                  </span>
                  <span className="mt-auto flex items-center gap-1 text-[0.78rem] font-medium text-eu-red-deep">
                    Open
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </EuCard>
              </Link>
            </EuStaggerItem>
          ))}
        </EuStagger>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        <StatCard value={String(hospitalDatasetMeta.recordCount)} label="Hospitals in the verified extract" />
        <StatCard value={String(hospitalDatasetMeta.publishedDistrictCount)} label="Bihar districts reported" />
        <StatCard value="0" label="Prices MEDIPAL has invented" />
      </section>

      <EuDatasetNote className="mt-8" />
    </EuShell>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <EuCard className="p-5">
      <p className="text-2xl font-semibold tracking-[-0.02em] text-eu-text">{value}</p>
      <p className="mt-1 text-[0.8rem] leading-relaxed text-eu-muted">{label}</p>
    </EuCard>
  );
}
