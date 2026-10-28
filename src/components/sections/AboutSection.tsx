import { ArrowRight, Bot, Building2, Droplets, Eye, HeartHandshake, LogIn, ShieldAlert, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { useUI } from "@/context/UIContext";

const pillars = [
  {
    id: "vision",
    title: "Our Vision",
    icon: Eye,
    body: "MEDIPAL is built around one conviction: health technology should reduce confusion, not add to it. We favour accessible, human-centred tools where the important information is easy to find, easy to read and easy to act on. Clarity matters far more than hype.",
  },
  {
    id: "blood-bank",
    title: "Blood Bank",
    icon: Droplets,
    body: "Blood donation information, ABO/Rh blood group education and donor interest registration live together in one place. An availability search interface is prepared and ready to connect to an authorised data source, so results become trustworthy the moment a verified source is live.",
  },
  {
    id: "ai-doctor",
    title: "AI Doctor",
    icon: Bot,
    body: "An AI health information companion helps people understand common health questions in plain language. It is designed to help you prepare for a conversation with a healthcare professional, never to take that professional's place.",
  },
  {
    id: "e-upchar",
    title: "E-UPCHAR",
    icon: Building2,
    body: "E-UPCHAR is a Bihar-first hospital directory paired with diagnostic booking. You can move from state to district to city to a specific hospital and its services, and manage appointments, patients and reports in one place. Prices are shown only where they have been verified.",
  },
  {
    id: "design",
    title: "Human-Centered Design",
    icon: HeartHandshake,
    body: "Readability, keyboard and screen-reader access, and respect for reduced-motion settings shape every screen. The interface stays honest about what it knows and what it does not, and it never makes a clinical claim.",
  },
];

const honestyPoints = [
  "It does not display live blood availability. Availability results appear only once an authorised data source is connected.",
  "It does not diagnose or treat any condition.",
  "It does not replace a qualified healthcare professional or provide emergency care.",
  "It does not claim hospital partnerships that have not been established, and shows a price only when that price has been verified.",
  "It does not present a MEDIPAL payment receipt as a hospital tax invoice or a treatment certificate.",
];

/** About content for the `/about` route: vision, all three experiences, design principles and CTA. */
export function AboutSection() {
  const { openLogin } = useUI();

  return (
    <section aria-labelledby="about-heading" className="section-pad relative pt-12 sm:pt-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-[34rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(233,30,77,0.12),transparent_70%)] blur-3xl" />
      </div>

      <div className="section-shell relative">
        <Reveal>
          <p className="eyebrow">ABOUT MEDIPAL</p>
          <h1
            id="about-heading"
            className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-content-primary sm:text-5xl lg:text-[3.4rem]"
          >
            Healthcare, <span className="text-gradient-red">Connected</span>.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-content-secondary sm:text-lg">
            MEDIPAL brings three experiences together: a blood bank built around donation and blood
            group education, an AI health information companion that explains common health
            questions in plain language, and E-UPCHAR, which helps you find hospitals and book
            diagnostics. One platform, one sign-in, one consistent place to start.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <Reveal key={pillar.id} delay={index * 0.07} className="h-full">
                <GlassCard interactive hairline className="flex h-full flex-col p-6">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-[linear-gradient(140deg,rgba(255,231,237,0.9),rgba(255,255,255,0.9))] shadow-[0_12px_30px_-18px_rgba(233,30,77,0.55),inset_0_1px_0_rgba(255,255,255,0.95)]">
                    <Icon className="h-5 w-5 text-crimson" aria-hidden />
                  </span>
                  <h2 className="mt-5 font-display text-lg font-semibold text-content-primary">
                    {pillar.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-content-secondary">
                    {pillar.body}
                  </p>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mt-10">
          <div className="glass-panel-soft glass-hairline relative overflow-hidden rounded-4xl p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-line bg-white/80">
                <ShieldAlert className="h-5 w-5 text-crimson" aria-hidden />
              </span>
              <h2 className="font-display text-xl font-semibold text-content-primary">
                What MEDIPAL does not do
              </h2>
            </div>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {honestyPoints.map((point) => (
                <li key={point} className="flex gap-3 text-sm leading-relaxed text-content-secondary">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal className="mt-12 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <Link to="/blood-bank" className="btn-primary">
            Explore the Blood Bank
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/ai-doctor" className="btn-secondary">
            Meet MEDIPAL AI
            <Sparkles className="h-4 w-4" aria-hidden />
          </Link>
          <Link to="/e-upchar" className="btn-secondary">
            Explore E-UPCHAR
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <button type="button" onClick={openLogin} className="btn-ghost">
            <LogIn className="h-4 w-4" aria-hidden />
            Sign in
          </button>
        </Reveal>
      </div>
    </section>
  );
}
