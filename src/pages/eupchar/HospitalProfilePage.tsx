import { useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  ClipboardList,
  Compass,
  Phone,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { cn } from "@/lib/cn";
import { EuDatasetNote, EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import {
  EuBadge,
  EuCard,
  EuEmptyState,
  EuNotice,
  EuSectionTitle,
  EuStagger,
  EuStaggerItem,
} from "@/components/eupchar/ui";
import { PracticeModeExplainer, PracticeModeToggle } from "@/components/eupchar/PracticeModeToggle";
import { ServiceCard } from "@/components/eupchar/ServiceCard";
import { serviceGroupLabels } from "@/data/eupchar/serviceCatalog";
import {
  selectCatalogueBuckets,
  selectHospital,
  selectHospitalCatalogue,
  selectServiceSearchResults,
} from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { formatPhone } from "@/lib/eupchar/format";
import { E_UPCHAR_COPY } from "@/types/eupchar";

export default function HospitalProfilePage() {
  const { hospitalId = "" } = useParams();
  const state = useEuState();
  const hospital = selectHospital(hospitalId, state);

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const catalogue = useMemo(() => selectHospitalCatalogue(hospitalId, state), [hospitalId, state]);
  const buckets = useMemo(() => selectCatalogueBuckets(hospitalId, state), [hospitalId, state]);
  const searchResults = useMemo(
    () => selectServiceSearchResults(hospitalId, query, state),
    [hospitalId, query, state],
  );

  if (!hospital) {
    return (
      <EuShell>
        <EuEmptyState
          icon={Building2}
          title="Hospital not found"
          description="This hospital is not in the verified dataset. E-UPCHAR never invents a hospital record to fill this page."
          action={
            <Link to="/e-upchar/hospitals" className="eu-btn eu-btn-primary px-4 py-2.5">
              Back to the hospital directory
            </Link>
          }
        />
      </EuShell>
    );
  }

  const phone = formatPhone(hospital.phone);
  const usingSearch = query.trim().length > 0;
  const visible = usingSearch
    ? searchResults
    : categoryId
      ? catalogue.filter((view) => view.category.id === categoryId)
      : catalogue;

  const grouped = usingSearch || categoryId ? null : buckets;

  return (
    <EuShell wide>
      <EuPageHeader
        eyebrow="E-UPCHAR · Bihar"
        title={hospital.name}
        description={
          hospital.city
            ? `${hospital.city}, ${hospital.district}, ${hospital.state}`
            : `${hospital.district}, ${hospital.state} — the dataset does not publish a city for this hospital.`
        }
        breadcrumb={[
          { label: "E-UPCHAR", to: "/e-upchar" },
          { label: "Hospitals", to: "/e-upchar/hospitals" },
          { label: hospital.district, to: `/e-upchar/hospitals?q=${encodeURIComponent(hospital.district)}` },
          { label: hospital.name },
        ]}
        actions={
          <>
            <Link
              to={`/e-upchar/directions/${hospital.id}`}
              className="eu-btn eu-btn-secondary gap-1.5 px-3.5 py-2 text-[0.82rem]"
            >
              <Compass className="h-3.5 w-3.5" aria-hidden />
              Location &amp; directions
            </Link>
            <PracticeModeToggle />
          </>
        }
      />

      <PracticeModeExplainer className="mb-5" />

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <EuCard className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              {hospital.ownership && <EuBadge tone="red">{hospital.ownership}</EuBadge>}
              {hospital.schemes.map((scheme) => (
                <EuBadge key={scheme} tone="ok">
                  {scheme}
                </EuBadge>
              ))}
              {hospital.empanelmentStatus && (
                <EuBadge tone="neutral">{hospital.empanelmentStatus}</EuBadge>
              )}
            </div>

            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label="Hospital ID" value={hospital.id} mono />
              <Detail label="District" value={`${hospital.district}, ${hospital.state}`} />
              <Detail
                label="Public contact"
                value={
                  phone ? (
                    <a href={`tel:${hospital.phone}`} className="inline-flex items-center gap-1.5 text-eu-red-deep hover:underline">
                      <Phone className="h-3.5 w-3.5" aria-hidden />
                      {phone}
                    </a>
                  ) : (
                    "Not published in the dataset"
                  )
                }
              />
              <Detail label="Street address" value="Not published in the dataset" />
              <Detail
                label="Departments"
                value={
                  hospital.departments.length > 0
                    ? hospital.departments.join(", ")
                    : "Not published in the dataset"
                }
              />
              <Detail label="Opening hours" value="Not published in the dataset" />
            </dl>
          </EuCard>

          <section>
            <EuSectionTitle
              title="Services at this hospital"
              description="A service appears here only when it is configured for this specific hospital. Nothing is copied across from another hospital."
            />

            <div className="relative mt-4">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-eu-muted"
                aria-hidden
              />
              <input
                className="eu-field pl-11"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCategoryId(null);
                }}
                placeholder={E_UPCHAR_COPY.serviceSearchPlaceholder}
                aria-label={E_UPCHAR_COPY.serviceSearchPlaceholder}
                autoComplete="off"
              />
            </div>

            {buckets.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryId(null);
                    setQuery("");
                  }}
                  aria-pressed={!categoryId && !usingSearch}
                  className={cn(
                    "eu-chip",
                    !categoryId && !usingSearch
                      ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep"
                      : "border-eu-border bg-eu-bg text-eu-muted",
                  )}
                >
                  All services ({catalogue.length})
                </button>
                {buckets.map((bucket) => (
                  <button
                    key={bucket.category.id}
                    type="button"
                    onClick={() => {
                      setCategoryId(bucket.category.id);
                      setQuery("");
                    }}
                    aria-pressed={categoryId === bucket.category.id}
                    className={cn(
                      "eu-chip",
                      categoryId === bucket.category.id
                        ? "border-eu-red bg-[#fdf0ed] text-eu-red-deep"
                        : "border-eu-border bg-eu-bg text-eu-muted",
                    )}
                  >
                    {bucket.category.label} ({bucket.views.length})
                  </button>
                ))}
              </div>
            )}

            {catalogue.length === 0 ? (
              <EuEmptyState
                className="mt-5"
                icon={ClipboardList}
                title="No services are configured for this hospital yet"
                description={`${E_UPCHAR_COPY.emptyCategory} The supplied Bihar dataset publishes no service catalogue or prices, so MEDIPAL will not display any until an authorised administrator configures them — or you switch on practice mode to walk the flow.`}
                action={<PracticeModeToggle />}
              />
            ) : visible.length === 0 ? (
              <EuEmptyState
                className="mt-5"
                icon={Search}
                title="No matching service"
                description="No service at this hospital matches that search. Try a different test name or clear the category filter."
              />
            ) : grouped ? (
              <div className="mt-6 space-y-8">
                {grouped.map((bucket) => (
                  <div key={bucket.category.id}>
                    <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">
                      {serviceGroupLabels[bucket.group]} · {bucket.category.label}
                    </h3>
                    <EuStagger className="mt-3 grid gap-4 sm:grid-cols-2">
                      {bucket.views.map((view) => (
                        <EuStaggerItem key={view.service.id} className="h-full">
                          <ServiceCard view={view} hospitalId={hospital.id} />
                        </EuStaggerItem>
                      ))}
                    </EuStagger>
                  </div>
                ))}
              </div>
            ) : (
              <EuStagger className="mt-5 grid gap-4 sm:grid-cols-2">
                {visible.map((view) => (
                  <EuStaggerItem key={view.service.id} className="h-full">
                    <ServiceCard view={view} hospitalId={hospital.id} />
                  </EuStaggerItem>
                ))}
              </EuStagger>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <EuCard className="p-5">
            <h2 className="text-[0.95rem] font-semibold text-eu-text">Booking at {hospital.district}</h2>
            <p className="mt-1.5 text-[0.82rem] leading-relaxed text-eu-muted">
              Choose a service to see its details, the price E-UPCHAR can verify, and the appointment
              options the hospital has made available.
            </p>
            <div className="mt-4 space-y-2.5">
              <Link
                to="/e-upchar/prescription"
                className="eu-btn eu-btn-secondary w-full justify-center gap-2 px-4 py-2.5 text-[0.85rem]"
              >
                <Upload className="h-4 w-4" aria-hidden />
                {E_UPCHAR_COPY.prescriptionHeading}
              </Link>
              <Link
                to="/e-upchar/location"
                className="eu-btn eu-btn-quiet w-full justify-center gap-2 px-4 py-2.5 text-[0.85rem]"
              >
                Change location
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </EuCard>

          <EuNotice tone="info" title="What this hospital is covered for">
            The dataset records this facility as a PM-JAY hospital. PM-JAY coverage depends on your
            beneficiary status and the specific treatment package. Call the Ayushman desk on{" "}
            {phone ?? "the published number"} and confirm before travelling.
          </EuNotice>

          <EuCard className="p-5">
            <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold text-eu-text">
              <ShieldCheck className="h-4 w-4 text-eu-ok" aria-hidden />
              Verified listing
            </h2>
            <p className="mt-1.5 text-[0.82rem] leading-relaxed text-eu-muted">
              Name, district, contact number, ownership and scheme come straight from the verified
              dataset. Everything this page does not know is labelled as such instead of guessed.
            </p>
            <EuDatasetNote className="mt-4" />
          </EuCard>
        </aside>
      </div>
    </EuShell>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">{label}</dt>
      <dd className={cn("mt-1 text-[0.85rem] text-eu-text", mono && "font-mono text-[0.8rem]")}>{value}</dd>
    </div>
  );
}
