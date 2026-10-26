import { Mail, Phone, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { MedipalLogo } from "@/components/ui/MedipalLogo";
import { hospitalDatasetMeta } from "@/data/eupchar/directory";

const bookingLinks = [
  { label: "E-UPCHAR Home", to: "/e-upchar" },
  { label: "Hospital Directory", to: "/e-upchar/hospitals" },
  { label: "Select Location", to: "/e-upchar/location" },
  { label: "My Appointments", to: "/e-upchar/appointments" },
];

const accountLinks = [
  { label: "My Patients", to: "/e-upchar/patients" },
  { label: "My Reports", to: "/e-upchar/reports" },
  { label: "About MEDIPAL", to: "/about" },
  { label: "Contact", to: "/contact" },
];

/** Light footer for E-UPCHAR so the module keeps its own clean identity. */
export function EuFooter() {
  return (
    <footer className="eu-no-print eu-scope relative border-t border-eu-border bg-eu-surface pb-10 pt-12">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <MedipalLogo size={34} tone="light" />
              <span className="flex flex-col leading-none">
                <span className="font-display text-sm font-semibold tracking-[0.2em] text-eu-text">
                  MEDIPAL
                </span>
                <span className="mt-1 font-manrope text-[0.5rem] uppercase tracking-[0.28em] text-eu-muted">
                  E-UPCHAR
                </span>
              </span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-eu-muted">
              Hospital discovery, diagnostic booking and patient management for Bihar — built on a
              verified PM-JAY hospital directory.
            </p>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-eu-muted">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-eu-red" aria-hidden />
              MEDIPAL is a booking platform. It is not the hospital and does not provide medical
              treatment. Reports, prices and availability appear only when the hospital or an
              authorised source provides them.
            </p>
          </div>

          <nav aria-label="E-UPCHAR booking" className="space-y-3">
            <h2 className="text-sm font-semibold text-eu-text">Booking</h2>
            <ul className="space-y-2">
              {bookingLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-eu-muted transition-colors duration-300 hover:text-eu-red-deep"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="E-UPCHAR account" className="space-y-3">
            <h2 className="text-sm font-semibold text-eu-text">Your account</h2>
            <ul className="space-y-2">
              {accountLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-eu-muted transition-colors duration-300 hover:text-eu-red-deep"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-eu-text">Support</h2>
            <a
              href="tel:7061241812"
              className="flex items-center gap-3 rounded-xl border border-eu-border bg-eu-bg px-4 py-3 text-sm text-eu-text transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-eu-red"
            >
              <Phone className="h-4 w-4 text-eu-red" aria-hidden />
              7061241812
            </a>
            <a
              href="mailto:flex8india@gmail.com"
              className="flex items-center gap-3 rounded-xl border border-eu-border bg-eu-bg px-4 py-3 text-sm text-eu-text transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-eu-red"
            >
              <Mail className="h-4 w-4 text-eu-red" aria-hidden />
              flex8india@gmail.com
            </a>
            <p className="text-xs leading-relaxed text-eu-muted">
              Hospital list: {hospitalDatasetMeta.recordCount} records from{" "}
              {hospitalDatasetMeta.sourceFile} ({hospitalDatasetMeta.preparedOn}).
            </p>
          </div>
        </div>

        <div className="eu-divider my-8" />

        <div className="flex flex-col gap-3 text-xs text-eu-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} MEDIPAL. All rights reserved.</p>
          <p className="max-w-2xl sm:text-right">
            Receipts issued here are MEDIPAL booking acknowledgements and payment receipts. An
            official hospital tax invoice must come from the hospital.
          </p>
        </div>
      </div>
    </footer>
  );
}
