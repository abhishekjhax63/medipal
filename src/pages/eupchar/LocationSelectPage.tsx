import { useMemo, useState } from "react";
import { Building2, Check, ChevronRight, MapPin, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuCard, EuNotice, EuSectionTitle } from "@/components/eupchar/ui";
import {
  biharDistrictReference,
  hospitalDatasetMeta,
  matchesHospitalQuery,
} from "@/data/eupchar/directory";
import { selectHospitals, selectLocationSelection, setLocationSelection } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { E_UPCHAR_COPY, type Hospital } from "@/types/eupchar";

/**
 * Select Location (spec §4).
 *
 * State → District → Hospital, in the supplied dataset's own hierarchy. Save is
 * disabled until a valid district is chosen. The choice is persisted so later
 * screens open on the right hospital. Geolocation is never requested here.
 */
export default function LocationSelectPage() {
  const state = useEuState();
  const navigate = useNavigate();
  const existing = selectLocationSelection(state);
  const hospitals = selectHospitals(state);

  const [stateName, setStateName] = useState(existing?.state ?? "");
  const [district, setDistrict] = useState(existing?.district ?? "");
  const [hospitalId, setHospitalId] = useState(existing?.hospitalId ?? "");
  const [query, setQuery] = useState("");

  const states = useMemo(() => [hospitalDatasetMeta.state], []);

  const districtsForState = useMemo(
    () =>
      stateName
        ? [...new Set(hospitals.filter((h) => h.state === stateName).map((h) => h.district))].sort(
            (a, b) => a.localeCompare(b),
          )
        : [],
    [hospitals, stateName],
  );

  const hospitalsForDistrict = useMemo(
    () =>
      district
        ? hospitals
            .filter((h) => h.district === district)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [hospitals, district],
  );

  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) return { districts: [] as string[], hospitals: [] as Hospital[] };
    return {
      districts: districtsForState.filter((d) => d.toLowerCase().includes(trimmed)),
      hospitals: hospitals.filter((h) => matchesHospitalQuery(h, trimmed)).slice(0, 12),
    };
  }, [query, districtsForState, hospitals]);

  const isValid = Boolean(stateName && district);
  const selectedHospital = hospitalId ? hospitals.find((h) => h.id === hospitalId) ?? null : null;

  function handleSave() {
    if (!isValid) return;
    setLocationSelection({
      state: stateName,
      district,
      hospitalId: hospitalId || null,
      savedAt: new Date().toISOString(),
    });
    navigate(selectedHospital ? `/e-upchar/hospitals/${selectedHospital.id}` : "/e-upchar/hospitals");
  }

  return (
    <EuShell>
      <EuPageHeader
        eyebrow="E-UPCHAR"
        title={E_UPCHAR_COPY.selectLocationTitle}
        description="Pick where you are. E-UPCHAR only shows hospitals that appear in the verified dataset for that district — nothing is added to fill a screen."
      />

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-eu-muted"
          aria-hidden
        />
        <input
          className="eu-field pl-11"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={E_UPCHAR_COPY.selectLocationSearch}
          autoComplete="off"
          aria-label={E_UPCHAR_COPY.selectLocationSearch}
        />
      </div>

      {query.trim().length >= 2 && (searchResults.districts.length > 0 || searchResults.hospitals.length > 0) && (
        <EuCard className="mt-3 overflow-hidden p-0">
          {searchResults.districts.map((match) => (
            <button
              key={`d-${match}`}
              type="button"
              className="flex w-full items-center gap-3 border-b border-eu-border px-4 py-3 text-left last:border-b-0 hover:bg-eu-surface"
              onClick={() => {
                setStateName(hospitalDatasetMeta.state);
                setDistrict(match);
                setHospitalId("");
                setQuery("");
              }}
            >
              <MapPin className="h-4 w-4 text-eu-muted" aria-hidden />
              <span className="text-sm text-eu-text">
                {match} <span className="text-eu-muted">· district</span>
              </span>
            </button>
          ))}
          {searchResults.hospitals.map((match) => (
            <button
              key={`h-${match.id}`}
              type="button"
              className="flex w-full items-center gap-3 border-b border-eu-border px-4 py-3 text-left last:border-b-0 hover:bg-eu-surface"
              onClick={() => {
                setStateName(match.state);
                setDistrict(match.district);
                setHospitalId(match.id);
                setQuery("");
              }}
            >
              <Building2 className="h-4 w-4 text-eu-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm text-eu-text">{match.name}</span>
                <span className="block text-[0.72rem] text-eu-muted">{match.district}</span>
              </span>
            </button>
          ))}
        </EuCard>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section>
          <EuSectionTitle title="State" description="The verified dataset covers Bihar." />
          <ul className="mt-4 space-y-2">
            {states.map((option) => (
              <li key={option}>
                <ChoiceButton
                  selected={stateName === option}
                  onClick={() => {
                    setStateName(option);
                    if (stateName !== option) {
                      setDistrict("");
                      setHospitalId("");
                    }
                  }}
                >
                  {option}
                </ChoiceButton>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <EuSectionTitle
            title="District"
            description={stateName ? "Districts in the dataset." : "Choose a state first."}
          />
          {stateName ? (
            <ul className="eu-scroll-x mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
              {districtsForState.map((option) => {
                const reference = biharDistrictReference.find((entry) => entry.district === option);
                return (
                  <li key={option}>
                    <ChoiceButton
                      selected={district === option}
                      onClick={() => {
                        setDistrict(option);
                        setHospitalId("");
                      }}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span>{option}</span>
                        <span className="text-[0.7rem] text-eu-muted">
                          {reference
                            ? reference.publishedHospitalCount === null
                              ? "no published count"
                              : `${reference.publishedHospitalCount} listed`
                            : ""}
                        </span>
                      </span>
                    </ChoiceButton>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-eu-muted">No district selected yet.</p>
          )}
        </section>

        <section>
          <EuSectionTitle
            title="Hospital (optional)"
            description={district ? "Choose a hospital, or keep the whole district." : "Choose a district first."}
          />
          {district ? (
            hospitalsForDistrict.length > 0 ? (
              <ul className="eu-scroll-x mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                <li>
                  <ChoiceButton selected={hospitalId === ""} onClick={() => setHospitalId("")}>
                    All hospitals in {district}
                  </ChoiceButton>
                </li>
                {hospitalsForDistrict.map((hospital) => (
                  <li key={hospital.id}>
                    <ChoiceButton
                      selected={hospitalId === hospital.id}
                      onClick={() => setHospitalId(hospital.id)}
                    >
                      {hospital.name}
                    </ChoiceButton>
                  </li>
                ))}
              </ul>
            ) : (
              <EuNotice tone="info" className="mt-4">
                The dataset has no row-level hospital for {district}. You can still save the district
                and browse — no hospital will be invented to fill the list.
              </EuNotice>
            )
          ) : (
            <p className="mt-4 text-sm text-eu-muted">No district selected yet.</p>
          )}
        </section>
      </div>

      <EuCard className="mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">
            Selection
          </p>
          <p className="mt-1 text-sm text-eu-text">
            {isValid
              ? `${stateName}${district ? ` · ${district}` : ""}${selectedHospital ? ` · ${selectedHospital.name}` : " · all hospitals"}`
              : "Choose a state and district to continue."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid}
          className={cn(
            "eu-btn gap-2 px-5 py-2.5",
            isValid ? "eu-btn-primary" : "cursor-not-allowed border border-eu-border bg-eu-surface text-eu-muted/70",
          )}
        >
          <Check className="h-4 w-4" aria-hidden />
          Save and continue
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </EuCard>

      <p className="mt-4 text-[0.75rem] text-eu-muted">
        E-UPCHAR never asks for your device location. Nothing is detected automatically; you always
        choose the place yourself.
      </p>
    </EuShell>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all duration-200 ease-smooth",
        selected
          ? "border-eu-red bg-[#fdf0ed] font-medium text-eu-red-deep"
          : "border-eu-border bg-eu-bg text-eu-text hover:border-[#c9ccd0] hover:shadow-eu-card",
      )}
    >
      {children}
    </button>
  );
}
