import { FileText, Hourglass } from "lucide-react";
import { Link } from "react-router-dom";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice } from "@/components/eupchar/ui";
import { services } from "@/data/eupchar/serviceCatalog";
import { selectBookings, selectHospital, selectReports } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { formatDate } from "@/lib/eupchar/format";

const statusTone = { ready: "ok", pending: "warn", not_available: "neutral" } as const;

export default function ReportsPage() {
  const state = useEuState();
  const reports = selectReports(state);
  const bookings = selectBookings(state).filter(
    (booking) => booking.status === "confirmed" || booking.status === "completed",
  );

  return (
    <EuShell>
      <EuPageHeader
        eyebrow="E-UPCHAR"
        title="My Reports"
        description="Diagnostic reports appear here only when an authorised source supplies them. MEDIPAL never generates or fabricates a report."
      />

      {reports.length === 0 ? (
        <EuEmptyState
          icon={FileText}
          title="No reports available"
          description="No diagnostic-report source is connected to MEDIPAL, so there is nothing to download. When a hospital or an authorised partner supplies a report for one of your bookings, it will appear here."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {reports.map((report) => (
            <EuCard as="li" key={report.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.95rem] font-semibold text-eu-text">{report.serviceName}</p>
                  <p className="text-[0.78rem] text-eu-muted">{report.hospitalName}</p>
                </div>
                <EuBadge tone={statusTone[report.status]}>{report.status.replace(/_/g, " ")}</EuBadge>
              </div>
              <p className="mt-3 text-[0.78rem] text-eu-muted">
                Report date: {report.reportDate ? formatDate(report.reportDate) : "Not yet issued"}
              </p>
              {report.downloadUrl ? (
                <a
                  href={report.downloadUrl}
                  className="eu-btn eu-btn-secondary mt-4 w-full justify-center px-4 py-2.5 text-[0.82rem]"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  Download report
                </a>
              ) : (
                <p className="mt-4 text-[0.75rem] leading-relaxed text-eu-muted">
                  No file has been supplied for this report yet.
                </p>
              )}
            </EuCard>
          ))}
        </ul>
      )}

      {bookings.length > 0 && (
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold text-eu-text">
            <Hourglass className="h-4 w-4 text-eu-muted" aria-hidden />
            Bookings where a report may be issued
          </h2>
          <p className="mt-1 text-[0.82rem] text-eu-muted">
            These bookings are confirmed or completed. A report shows up here only if the hospital
            publishes one to MEDIPAL.
          </p>
          <ul className="mt-4 space-y-3">
            {bookings.map((booking) => {
              const hospital = selectHospital(booking.hospitalId, state);
              const service = services.find((entry) => entry.id === booking.serviceId) ?? null;
              return (
                <EuCard as="li" key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-[0.88rem] font-medium text-eu-text">
                      {service?.name ?? booking.serviceId}
                    </p>
                    <p className="text-[0.75rem] text-eu-muted">
                      {hospital?.name ?? booking.hospitalId} · {formatDate(booking.createdAt)}
                    </p>
                  </div>
                  <Link
                    to={`/e-upchar/receipt/${booking.id}`}
                    className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.78rem]"
                  >
                    View booking
                  </Link>
                </EuCard>
              );
            })}
          </ul>
        </section>
      )}

      <EuNotice tone="warn" className="mt-8" title="MEDIPAL does not create reports">
        A diagnostic report is a clinical document produced by the hospital's laboratory or radiology
        department. MEDIPAL only passes it on when the hospital supplies it — it never writes one, and
        never invents values.
      </EuNotice>
    </EuShell>
  );
}
