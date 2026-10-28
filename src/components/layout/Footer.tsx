import { Mail, Phone, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { MedipalLogo } from "@/components/ui/MedipalLogo";

const experienceLinks = [
  { label: "Blood Bank", to: "/" },
  { label: "AI Doctor", to: "/ai-doctor" },
  { label: "E-UPCHAR", to: "/e-upchar" },
  { label: "Blood Group Explorer", to: "/#blood-groups" },
  { label: "Donor Registration", to: "/#donor-registration" },
];

const platformLinks = [
  { label: "About", to: "/about" },
  { label: "Reviews", to: "/reviews" },
  { label: "Contact", to: "/contact" },
  { label: "Availability Search", to: "/#availability-search" },
  { label: "Facility console", to: "/blood-bank/facility" },
  { label: "Platform admin", to: "/blood-bank/admin" },
  { label: "Blood data sync", to: "/admin/blood-data" },
];

export function Footer() {
  return (
    <footer className="relative mt-10 pb-10">
      <div className="section-shell">
        <div className="glass-panel glass-hairline rounded-4xl px-6 py-10 sm:px-10">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
            <div className="space-y-4">
              <MedipalLogo size={40} withWordmark />
              <p className="max-w-sm text-sm leading-relaxed text-content-secondary">
                MEDIPAL brings blood donation information, an AI health information companion, and
                E-UPCHAR hospital discovery and diagnostic booking into one considered experience.
              </p>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-content-secondary/80">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crimson-bright" aria-hidden />
                Demonstration build. Live blood availability appears only when an authorised data
                source is connected.
              </p>
            </div>

            <nav aria-label="Experiences" className="space-y-3">
              <h2 className="font-display text-sm font-semibold tracking-wide text-content-primary">
                Experiences
              </h2>
              <ul className="space-y-2">
                {experienceLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-content-secondary transition-colors duration-300 hover:text-crimson-bright"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Platform" className="space-y-3">
              <h2 className="font-display text-sm font-semibold tracking-wide text-content-primary">
                Platform
              </h2>
              <ul className="space-y-2">
                {platformLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-content-secondary transition-colors duration-300 hover:text-crimson-bright"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="space-y-3">
              <h2 className="font-display text-sm font-semibold tracking-wide text-content-primary">
                Contact
              </h2>
              <a
                href="tel:7061241812"
                className="flex items-center gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3 text-sm text-content-primary transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-crimson-bright/45"
              >
                <Phone className="h-4 w-4 text-crimson-bright" aria-hidden />
                7061241812
              </a>
              <a
                href="mailto:flex8india@gmail.com"
                className="flex items-center gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3 text-sm text-content-primary transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-crimson-bright/45"
              >
                <Mail className="h-4 w-4 text-crimson-bright" aria-hidden />
                flex8india@gmail.com
              </a>
            </div>
          </div>

          <div className="divider-glass my-8" />

          <div className="flex flex-col gap-3 text-xs text-content-secondary sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} MEDIPAL. All rights reserved.</p>
            <p className="max-w-xl sm:text-right">
              MEDIPAL provides general informational assistance. It does not replace a qualified
              healthcare professional or provide emergency care.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
