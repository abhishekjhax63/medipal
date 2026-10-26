import { ArrowRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import type { HospitalServiceView } from "@/types/eupchar";
import { EuBadge, EuCard, EuPrice } from "@/components/eupchar/ui";
import { testsIncludedCount } from "@/data/eupchar/serviceCatalog";

/**
 * One catalogue row (spec §7): service name, category, the number of included
 * tests, the price — or the exact unverified copy — and a Select action.
 */
export function ServiceCard({
  view,
  hospitalId,
  selected = false,
}: {
  view: HospitalServiceView;
  hospitalId: string;
  selected?: boolean;
}) {
  const includedCount = testsIncludedCount(view.service);
  const requiresPrescription = view.hospitalService.requiresPrescription;

  return (
    <EuCard
      as="li"
      interactive
      className={`flex flex-col p-5 ${selected ? "border-eu-red ring-1 ring-eu-red/30" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">
            {view.category.label}
          </p>
          <h3 className="mt-1 text-[1rem] font-semibold leading-snug text-eu-text">
            {view.service.name}
          </h3>
        </div>
        {requiresPrescription && (
          <EuBadge tone="neutral" className="shrink-0">
            <FileText className="h-3 w-3" aria-hidden />
            Prescription
          </EuBadge>
        )}
      </div>

      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-eu-muted">{view.service.summary}</p>

      <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.78rem] text-eu-muted">
        <div className="flex items-center gap-1.5">
          <dt className="font-medium text-eu-text">Tests Included:</dt>
          <dd>{includedCount > 0 ? includedCount : "—"}</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-eu-border pt-4">
        <EuPrice paise={view.displayPricePaise} status={view.priceStatus} />
        <Link
          to={`/e-upchar/services/${view.service.id}?hospital=${encodeURIComponent(hospitalId)}`}
          className="eu-btn eu-btn-secondary shrink-0 gap-1.5 px-3.5 py-2 text-[0.8rem]"
        >
          Select
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </EuCard>
  );
}
