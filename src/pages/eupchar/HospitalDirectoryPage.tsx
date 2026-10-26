import { useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Phone, Search, SlidersHorizontal, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/cn";
import { EuDatasetNote, EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice, EuSectionTitle } from "@/components/eupchar/ui";
import { PracticeModeExplainer, PracticeModeToggle } from "@/components/eupchar/PracticeModeToggle";
import { groupHospitalsByDistrict, hospitalDatasetMeta, matchesHospitalQuery } from "@/data/eupchar/directory";
import { useEuStore } from "@/hooks/eupchar/useEuStore";
import { formatPhone } from "@/lib/eupchar/format";
import type { Hospital } from "@/types/eupchar";

const GROUP_LABELS: Record<string, string> = {
  imaging: "Scans & Imaging",
  laboratory: "Laboratory",
  other: "Other services",
};

export default function HospitalDirectoryPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  
  const { hospitals, fetchHospitals, isLoading, error } = useEuStore();

  useEffect(() => {
    const params = new URLSearchParams();
    if (params.get("group")) params.set("group", params.get("group")!);
    if (params.get("category")) params.set("category", params.get("category")!);
    fetchHospitals(params);
  }, [params, fetchHospitals]);

  const filtered = useMemo(() => {
    return hospitals.filter((hospital) => matchesHospitalQuery(hospital, query));
  }, [hospitals, query]);

  const ordered = useMemo(() => {
    return groupHospitalsByDistrict(filtered);
  }, [filtered]);

  const totalShown = filtered.length;

  function clearFilters() {
    setQuery("");
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("group");
      next.delete("category");
      next.delete("q");
      return next;
    });
  }

  return (
    <EuShell wide>
      <EuPageHeader
        eyebrow="E-UPCHAR · Bihar"
        title="Hospital Directory"
        description={`Every hospital below comes from the verified dataset — ${hospitalDatasetMeta.recordCount} row-level records across Bihar. MEDIPAL adds no hospital of its own.`}
        actions={
          <>
            <Link to="/e-upchar/location" className="eu-btn eu-btn-secondary gap-1.5 px-3.5 py-2 text-[0.82rem]">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              Select Location
            </Link>
            <PracticeModeToggle />
          </>
        }
      />

      <PracticeModeExplainer className="mb-5" />

      <div className="grid gap-3 sm:grid-cols-[1.6fr_auto] sm:items-end">
        <div className="relative">
          <label className="eu-label" htmlFor="hospital-search">
            Search hospitals
          </label>
          <Search
            className="pointer-events-none absolute left-4 top-[2.15rem] h-4 w-4 text-eu-muted"
            aria-hidden
          />
          <input
            id="hospital-search"
            className="eu-field pl-11"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by hospital name, district or ID"
            autoComplete="off"
          />
        </div>
        {(params.get("group") || params.get("category") || query) && (
          <button type="button" onClick={clearFilters} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2.5 text-[0.82rem]">
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-eu-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filter
        </span>
        {Object.keys(GROUP_LABELS).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() =>
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete("category");
                if (params.get("group") === key) next.delete("group");
                else next.set("group", key);
                return next;
              })
            }
            aria-pressed={params.get("group") === key}
            className={cn(
              "eu-chip",
              params.get("group") === key ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep" : "border-eu-border bg-eu-bg text-eu-muted",
            )}
          >
            {GROUP_LABELS[key]}
          </button>
        ))}
      </div>

      <p className="mt-4 text-[0.8rem] text-eu-muted">
        Showing <span className="font-medium text-eu-text">{totalShown}</span>
        {totalShown === 1 ? " hospital" : " hospitals"}.
      </p>

      {isLoading && (
        <div className="mt-6 space-y-4">
          <EuCard className="p-5"><div className="h-20 animate-pulse bg-eu-surface rounded-xl" /></EuCard>
          <EuCard className="p-5"><div className="h-20 animate-pulse bg-eu-surface rounded-xl" /></EuCard>
        </div>
      )}

      {error && (
        <EuEmptyState
          className="mt-6"
          icon={Building2}
          title="Failed to load hospitals"
          description={error}
          action={
            <button type="button" onClick={() => fetchHospitals()} className="eu-btn eu-btn-secondary px-4 py-2.5">
              Retry
            </button>
          }
        />
      )}

      {!isLoading && !error && totalShown === 0 && (
        <EuEmptyState
          className="mt-6"
          icon={Building2}
          title="No hospitals match your criteria"
          description="Try adjusting your filters or search query."
          action={
            <button type="button" onClick={clearFilters} className="eu-btn eu-btn-secondary px-4 py-2.5">
              Clear filters
            </button>
          }
        />
      )}

      {!isLoading && !error && totalShown > 0 && (
        <div className="mt-6 space-y-10">
          {ordered.map((group_) => (
            <section key={group_.district}>
              <EuSectionTitle
                title={group_.district}
                description={`Hospitals in ${group_.district}`}
                action={
                  <EuBadge tone="neutral">
                    {group_.hospitals.length} in extract
                  </EuBadge>
                }
              />
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group_.hospitals.map((hospital) => (
                  <li key={hospital.id}>
                    <HospitalCard hospital={hospital} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <EuNotice tone="info" className="mt-10">
        Hospitals marked “Approved for Empanelment” are listed for PM-JAY. Empanelment is beneficiary
        and package dependent — it does not mean every treatment is free. Confirm the exact procedure
        and coverage with the hospital's Ayushman desk before you travel.
      </EuNotice>

      <EuDatasetNote className="mt-6" />
    </EuShell>
  );
}

function HospitalCard({ hospital }: { hospital: Hospital }) {
  const phone = formatPhone(hospital.phone);
  return (
    <EuCard interactive className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold text-eu-text">
            {hospital.name}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] text-eu-muted">
            {hospital.district}, {hospital.state}
          </p>
        </div>
        <EuBadge tone="neutral">
          {hospital.ownership}
        </EuBadge>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link to={`/e-upchar/hospitals/${hospital.id}`} className="eu-btn eu-btn-primary px-4 py-2 text-[0.8rem] flex-1 justify-center">
          View Services
        </Link>
        {phone && (
          <a href={`tel:${phone}`} className="eu-btn eu-btn-secondary px-4 py-2 text-[0.8rem]">
            <Phone className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
    </EuCard>
  );
}
