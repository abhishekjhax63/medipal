import { ArrowLeft, FileText, Printer, ShieldAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuNotice } from "@/components/eupchar/ui";
import { services } from "@/data/eupchar/serviceCatalog";
import {
  selectBooking,
  selectHospital,
  selectInvoice,
  selectPatient,
  selectPayment,
} from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { formatDateTime, formatPaise } from "@/lib/eupchar/format";
import { E_UPCHAR_COPY } from "@/types/eupchar";

/**
 * Digital receipt (spec §15).
 *
 * Always a MEDIPAL document. `documentType` drives the title so this screen can
 * never be mistaken for — or rendered as — an official hospital tax invoice.
 */
export default function ReceiptPage() {
  const { bookingId = "" } = useParams();
  const state = useEuState();
  const booking = selectBooking(bookingId, state);
  const invoice = selectInvoice(booking?.invoiceId ?? null, state);

  if (!booking) {
    return (
      <EuShell>
        <EuEmptyState
          icon={FileText}
          title="Receipt not found"
          description="MEDIPAL has no booking with that reference in your account."
          action={
            <Link to="/e-upchar/appointments" className="eu-btn eu-btn-primary px-4 py-2.5">
              My Appointments
            </Link>
          }
        />
      </EuShell>
    );
  }

  const hospital = selectHospital(booking.hospitalId, state);
  const patient = selectPatient(booking.patientId, state);
  const payment = selectPayment(booking.paymentId, state);
  const service = services.find((entry) => entry.id === booking.serviceId) ?? null;

  const title =
    invoice?.documentType === "medipal_payment_receipt"
      ? "MEDIPAL Payment Receipt"
      : "MEDIPAL Booking Acknowledgement";

  function print() {
    window.print();
  }

  return (
    <EuShell>
      <div className="mx-auto max-w-3xl">
        <div className="eu-no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link to={`/e-upchar/confirmation/${booking!.id}`} className="eu-btn eu-btn-quiet gap-1.5 px-3 py-2 text-[0.82rem]">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to confirmation
          </Link>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={print} className="eu-btn eu-btn-secondary gap-2 px-4 py-2.5 text-[0.82rem]">
              <Printer className="h-4 w-4" aria-hidden />
              Print
            </button>
            <button type="button" onClick={print} className="eu-btn eu-btn-secondary gap-2 px-4 py-2.5 text-[0.82rem]">
              <FileText className="h-4 w-4" aria-hidden />
              Save as PDF
            </button>
            <Link to="/e-upchar/appointments" className="eu-btn eu-btn-quiet gap-2 px-4 py-2.5 text-[0.82rem]">
              View booking details
            </Link>
          </div>
        </div>

        <EuCard className="p-6 sm:p-9">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-eu-border pb-5">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-eu-red-deep">
                MEDIPAL
              </p>
              <h1 className="mt-2 text-xl font-semibold tracking-[-0.01em] text-eu-text">{title}</h1>
              <p className="mt-1 text-[0.78rem] text-eu-muted">
                Document number {invoice?.invoiceNumber ?? "pending issue"}
              </p>
            </div>
            <div className="text-right text-[0.78rem]">
              <p className="text-eu-muted">
                Issued {invoice ? formatDateTime(invoice.issuedAt) : "—"}
              </p>
              <p className="mt-1 text-eu-muted">
                Booking reference <span className="font-mono text-eu-text">{booking.reference}</span>
              </p>
              {invoice?.sandbox && (
                <p className="mt-2">
                  <EuBadge tone="practice">Sandbox — no money processed</EuBadge>
                </p>
              )}
            </div>
          </header>

          <div className="grid gap-6 border-b border-eu-border py-5 sm:grid-cols-2">
            <Block label="Billed to">
              <p className="text-eu-text">{patient?.fullName ?? "—"}</p>
              {patient && (
                <p className="text-[0.78rem] text-eu-muted">
                  {patient.phone}
                  {patient.email ? ` · ${patient.email}` : ""}
                </p>
              )}
            </Block>
            <Block label="Service provider">
              <p className="text-eu-text">{hospital?.name ?? booking.hospitalId}</p>
              <p className="text-[0.78rem] text-eu-muted">
                {hospital ? `${hospital.district}, ${hospital.state}` : ""}
              </p>
              <p className="text-[0.75rem] text-eu-muted">Address not published in the dataset</p>
            </Block>
          </div>

          <table className="mt-5 w-full text-left text-[0.85rem]">
            <thead>
              <tr className="text-[0.7rem] uppercase tracking-[0.12em] text-eu-muted">
                <th scope="col" className="pb-2 font-semibold">
                  Description
                </th>
                <th scope="col" className="pb-2 text-center font-semibold">
                  Qty
                </th>
                <th scope="col" className="pb-2 text-right font-semibold">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-eu-border">
              {invoice ? (
                invoice.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-3 text-eu-text">{line.label}</td>
                    <td className="py-3 text-center text-eu-muted">{line.quantity}</td>
                    <td className="py-3 text-right text-eu-text">
                      {formatPaise(line.unitPricePaise) ?? "Not verified"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 text-eu-text">{service?.name ?? booking.serviceId}</td>
                  <td className="py-3 text-center text-eu-muted">1</td>
                  <td className="py-3 text-right text-eu-muted">
                    {formatPaise(booking.totalPayablePaise) ?? "Not verified"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-5 flex items-end justify-between gap-4 border-t border-eu-border pt-4">
            <div className="text-[0.78rem]">
              <p className="text-eu-muted">
                Payment status:{" "}
                <span className="font-medium text-eu-text">
                  {(invoice?.paymentStatus ?? payment?.status ?? "not_collected").replace(/_/g, " ")}
                </span>
              </p>
              {invoice?.paymentReference && (
                <p className="mt-0.5 text-eu-muted">
                  Reference <span className="font-mono text-eu-text">{invoice.paymentReference}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[0.7rem] uppercase tracking-[0.14em] text-eu-muted">Total</p>
              <p className="text-lg font-semibold text-eu-text">
                {formatPaise(invoice?.amountPaise ?? booking.totalPayablePaise) ?? "—"}
              </p>
            </div>
          </div>
        </EuCard>

        <EuNotice tone="warn" title="This is a MEDIPAL document" className="mt-5">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-eu-warn" aria-hidden />
            <span>
              It is a MEDIPAL booking acknowledgement / payment receipt — not a hospital tax invoice,
              not a GST invoice, and not proof of treatment. An official hospital invoice must be
              issued by the hospital itself.{" "}
              {booking.totalPayablePaise === null && E_UPCHAR_COPY.priceUnavailable}
            </span>
          </span>
        </EuNotice>
      </div>
    </EuShell>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-eu-muted">{label}</p>
      <div className="mt-1.5 space-y-0.5">{children}</div>
    </div>
  );
}
