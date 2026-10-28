import { Mail, Phone, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { MedipalLogo } from "@/components/ui/MedipalLogo";

const serviceLinks = [
  { label: "Blood Bank", to: "/blood-bank" },
  { label: "AI Doctor", to: "/ai-doctor" },
  { label: "E-UPCHAR", to: "/e-upchar" },
  { label: "Ambulance", to: "/ambulance" },
];

const platformLinks = [
  { label: "About MEDIPAL", to: "/about" },
  { label: "Reviews", to: "/reviews" },
  { label: "Contact", to: "/contact" },
  { label: "Emergency information", to: "/emergency" },
];

const policyLinks = [
  { label: "Privacy policy", to: "/privacy" },
  { label: "Terms of use", to: "/terms" },
];

function FooterNav({ title, links }: { title: string; links: readonly { label: string; to: string }[] }) {
  return (
    <nav aria-label={title} className="space-y-3">
      <h2 className="text-sm font-semibold text-content-primary">{title}</h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="text-sm text-content-secondary transition-colors duration-200 hover:text-brand-deep hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Site-wide footer. Rendered once, from the app shell. */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="section-shell py-12 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr]">
          <div className="space-y-4">
            <MedipalLogo size={38} withWordmark />
            <p className="max-w-sm text-sm leading-relaxed text-content-secondary">
              MEDIPAL brings blood services, an AI health information companion, hospital discovery
              and emergency transport information into one place.
            </p>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-content-secondary">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
              Live blood availability and provider details appear only when an authorised data
              source is connected.
            </p>
          </div>

          <FooterNav title="Services" links={serviceLinks} />
          <FooterNav title="Platform" links={platformLinks} />
          <FooterNav title="Policies" links={policyLinks} />

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-content-primary">Contact</h2>
            <a
              href="tel:7061241812"
              className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm text-content-primary transition-colors duration-200 hover:border-brand/45 hover:bg-brand-wash"
            >
              <Phone className="h-4 w-4 text-brand" aria-hidden />
              7061241812
            </a>
            <a
              href="mailto:flex8india@gmail.com"
              className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm text-content-primary transition-colors duration-200 hover:border-brand/45 hover:bg-brand-wash"
            >
              <Mail className="h-4 w-4 text-brand" aria-hidden />
              flex8india@gmail.com
            </a>
          </div>
        </div>

        <div className="my-8 h-px bg-line" />

        <div className="flex flex-col gap-3 text-xs text-content-secondary sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} MEDIPAL. All rights reserved.</p>
          <p className="max-w-xl sm:text-right">
            MEDIPAL provides general health information. It does not replace a qualified healthcare
            professional, and it is not an emergency service. In an emergency, call 112 or 108.
          </p>
        </div>
      </div>
    </footer>
  );
}
