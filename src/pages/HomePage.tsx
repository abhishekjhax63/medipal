import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Droplets,
  ShieldAlert,
  Siren,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { HealthcareImage } from "@/components/ui/HealthcareImage";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Public home page.
 *
 * It is deliberately narrow in ambition: it explains what MEDIPAL is, gives
 * one obvious way into each of the four services, and then states plainly what
 * the platform can and cannot do. There are no invented hospital counts,
 * patient numbers or success rates anywhere on it, and no photograph is
 * described as a real MEDIPAL doctor, patient or hospital.
 *
 * The photographs are the project's own local environment shots, served from
 * `public/assets/`. They show clinical settings rather than identifiable
 * people, because MEDIPAL has no licensed portrait of a real clinician or
 * patient and must not imply otherwise. `HealthcareImage` reserves the frame
 * before the file arrives and prints an honest message if one fails to load,
 * so the layout never depends on a network image.
 */

const heroImage = "/assets/hero-healthcare-reception.jpg";

type Service = {
  id: string;
  title: string;
  description: string;
  to: string;
  action: string;
  Icon: typeof Droplets;
  image: string;
  alt: string;
};

const services: readonly Service[] = [
  {
    id: "blood-bank",
    title: "Blood Bank",
    description:
      "Search verified blood centres by location and blood group, and see when each figure was last reported.",
    to: "/blood-bank",
    action: "Find blood",
    Icon: Droplets,
    image: "/assets/service-blood-bank.jpg",
    alt: "Sealed blood donation collection bags stored on a refrigerated laboratory rack.",
  },
  {
    id: "ai-doctor",
    title: "AI Doctor",
    description:
      "Describe a symptom or upload a photo of a prescription and get general health information, with a clear reminder that it is not a diagnosis.",
    to: "/ai-doctor",
    action: "Ask AI Doctor",
    Icon: Sparkles,
    image: "/assets/service-ai-doctor.jpg",
    alt: "A stethoscope and tablet computer on a clean clinic desk.",
  },
  {
    id: "e-upchar",
    title: "E-UPCHAR",
    description:
      "Explore hospitals and diagnostic services. A price is shown only when it carries a named source and a verification date.",
    to: "/e-upchar",
    action: "Explore E-UPCHAR",
    Icon: Building2,
    image: "/assets/service-e-upchar.jpg",
    alt: "A diagnostic laboratory bench with a microscope and sample racks.",
  },
  {
    id: "ambulance",
    title: "Ambulance assistance",
    description:
      "See published ambulance providers, their service area and how to reach them. MEDIPAL does not dispatch a vehicle.",
    to: "/ambulance",
    action: "View providers",
    Icon: Siren,
    image: "/assets/service-ambulance.jpg",
    alt: "An ambulance parked outside a hospital emergency entrance.",
  },
];

const heroActions = [
  { label: "Find Blood", to: "/blood-bank", primary: true },
  { label: "Ask AI Doctor", to: "/ai-doctor", primary: false },
  { label: "Explore E-UPCHAR", to: "/e-upchar", primary: false },
  { label: "Ambulance Assistance", to: "/ambulance", primary: false },
] as const;

const capabilities = [
  "Shows each facility's published address, contact number and the source the record came from.",
  "Shows the time a blood stock figure was reported, and says so when nothing recent has been reported.",
  "Keeps emergency numbers visible on the pages where you might need them quickly.",
  "Tells you when a price, a slot or a live data source is not available, instead of showing a placeholder.",
];

const limitations = [
  "It does not dispatch an ambulance, blood, a doctor or any other resource.",
  "It does not confirm a booking or a request — a provider confirms it directly.",
  "It does not give medical advice, a diagnosis or a treatment plan.",
  "It does not publish hospital counts, patient numbers or success rates, because it has no verified figure for them.",
];

export default function HomePage() {
  return (
    <main className="flex-1 pb-4">
      {/* ---------------- Hero ---------------- */}
      <section className="section-shell pb-14 pt-10 lg:pb-20 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="eyebrow">MEDIPAL health platform</p>
            <h1 className="mt-4 font-display text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.03em] text-content-primary sm:text-5xl lg:text-[3.35rem]">
              Healthcare, Made Easier for Everyone
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-content-secondary sm:text-lg">
              Find blood services, explore healthcare options, and access digital health assistance
              through one simple platform.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {heroActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className={action.primary ? "btn-primary" : "btn-secondary"}
                >
                  {action.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ))}
            </div>

            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-content-secondary">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
              MEDIPAL shares published information. It does not provide emergency care — in a
              life-threatening emergency, call 112.
            </p>
          </div>

          <HealthcareImage
            src={heroImage}
            alt="A bright hospital reception area with empty waiting chairs and natural daylight."
            ratioClassName="aspect-[4/3] lg:aspect-[5/4]"
            loading="eager"
          />
        </div>
      </section>

      {/* ---------------- Four services ---------------- */}
      <section className="section-shell section-pad pt-0">
        <Reveal className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-content-primary sm:text-3xl">
            What would you like to do today?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-content-secondary">
            Choose a service to continue. Each one opens the details you need before you decide
            anything.
          </p>
        </Reveal>

        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <li key={service.id} className="h-full">
              <Reveal delay={index * 0.06} className="h-full">
                <div className="surface-card flex h-full flex-col overflow-hidden">
                  <HealthcareImage
                    src={service.image}
                    alt={service.alt}
                    ratioClassName="aspect-[4/3]"
                    flush
                  />
                  <div className="flex flex-1 flex-col p-5">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand-deep">
                      <service.Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-content-primary">
                      {service.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-content-secondary">
                      {service.description}
                    </p>
                    <Link
                      to={service.to}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline"
                    >
                      {service.action}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- Honest trust section ---------------- */}
      <section className="section-shell pb-20 lg:pb-24">
        <Reveal>
          <div className="rounded-3xl border border-line bg-white p-6 shadow-card sm:p-10">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-content-primary sm:text-3xl">
              What MEDIPAL does, and what it does not
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-content-secondary">
              Healthcare decisions should not rest on a number that nobody checked. MEDIPAL shows
              its sources, and says when it has nothing to show.
            </p>

            <div className="mt-9 grid gap-8 lg:grid-cols-2">
              <div className="surface-info p-6">
                <h3 className="flex items-center gap-2 text-base font-semibold text-content-primary">
                  <CheckCircle2 className="h-5 w-5 text-brand" aria-hidden />
                  What it does
                </h3>
                <ul className="mt-4 space-y-3">
                  {capabilities.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2.5 text-sm leading-relaxed text-content-secondary"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-line bg-canvas-alt p-6">
                <h3 className="flex items-center gap-2 text-base font-semibold text-content-primary">
                  <ShieldAlert className="h-5 w-5 text-content-secondary" aria-hidden />
                  What it does not
                </h3>
                <ul className="mt-4 space-y-3">
                  {limitations.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2.5 text-sm leading-relaxed text-content-secondary"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-content-secondary/50"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="mt-8 text-sm leading-relaxed text-content-secondary">
              Want the detail behind those points? Read the{" "}
              <Link to="/about" className="font-medium text-brand-deep hover:underline">
                about page
              </Link>
              , the{" "}
              <Link to="/terms" className="font-medium text-brand-deep hover:underline">
                terms of use
              </Link>{" "}
              or the{" "}
              <Link to="/emergency" className="font-medium text-brand-deep hover:underline">
                emergency information
              </Link>{" "}
              page.
            </p>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
