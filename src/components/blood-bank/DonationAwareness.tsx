import { ClipboardCheck, HandHeart, Info, Stethoscope, type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";

type Education = {
  id: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

const education: readonly Education[] = [
  {
    id: "voluntary",
    title: "Voluntary blood donation",
    body: "Donation is a voluntary act carried out through authorised blood banks, hospitals and donation camps, with screening and consent handled by trained staff.",
    icon: HandHeart,
  },
  {
    id: "eligibility",
    title: "Check eligibility with professionals",
    body: "Eligibility depends on your health, medical history and recent travel or medication. Always confirm your suitability with a qualified healthcare professional.",
    icon: Stethoscope,
  },
  {
    id: "guidance",
    title: "Follow authorised centre guidance",
    body: "Each authorised donation centre gives its own preparation and aftercare instructions. Follow the staff's guidance on hydration, rest and follow-up.",
    icon: ClipboardCheck,
  },
  {
    id: "accurate",
    title: "Value accurate information",
    body: "Rely on verified sources and confirm details with a clinician. Accurate information keeps both donors and recipients safe.",
    icon: Info,
  },
];

/** Decorative translucent glass droplet with a crimson inner glow. */
function GlassDroplet() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md">
      <div className="pointer-events-none absolute inset-x-6 bottom-6 h-20 rounded-[50%] bg-[radial-gradient(closest-side,rgba(10,61,117,0.4),transparent_72%)] blur-2xl" />

      <svg
        viewBox="0 0 200 220"
        className="relative mx-auto h-auto w-full max-w-[300px] animate-float-y drop-shadow-[0_40px_80px_rgba(10,61,117,0.32)]"
        aria-hidden
      >
        <defs>
          <linearGradient id="bb-drop-fill" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="rgba(46,134,222,0.62)" />
            <stop offset="46%" stopColor="rgba(10,61,117,0.42)" />
            <stop offset="100%" stopColor="rgba(6,42,78,0.78)" />
          </linearGradient>
          <radialGradient id="bb-drop-glow" cx="36%" cy="30%" r="66%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.62)" />
            <stop offset="46%" stopColor="rgba(46,134,222,0.34)" />
            <stop offset="100%" stopColor="rgba(6,42,78,0)" />
          </radialGradient>
          <linearGradient id="bb-drop-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(46,134,222,0.4)" />
          </linearGradient>
        </defs>

        <path
          d="M100 14 C 100 14 42 96 42 140 C 42 172 68 198 100 198 C 132 198 158 172 158 140 C 158 96 100 14 100 14 Z"
          fill="url(#bb-drop-fill)"
          stroke="url(#bb-drop-edge)"
          strokeWidth="1.4"
        />
        <path
          d="M100 14 C 100 14 42 96 42 140 C 42 172 68 198 100 198 C 132 198 158 172 158 140 C 158 96 100 14 100 14 Z"
          fill="url(#bb-drop-glow)"
          opacity="0.9"
        />

        {/* Specular highlight + reflection */}
        <ellipse cx="76" cy="112" rx="13" ry="20" fill="rgba(255,255,255,0.6)" transform="rotate(-24 76 112)" />
        <ellipse cx="82" cy="118" rx="6" ry="10" fill="rgba(255,255,255,0.75)" transform="rotate(-24 82 118)" />
        <path
          d="M126 160 C 132 168 130 176 122 180"
          fill="none"
          stroke="rgba(255,255,255,0.42)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/** Editorial "why it matters" section — educational, no medical promises. */
export function DonationAwareness() {
  return (
    <section className="section-shell section-pad">
      <div className="grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div>
          <Reveal>
            <p className="eyebrow">
              <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-gradient-to-r from-crimson-bright to-transparent align-middle" />
              Donation awareness
            </p>
            <h2 className="mt-5 font-display text-[2.2rem] font-semibold leading-[1.04] tracking-[-0.035em] text-content-primary sm:text-5xl lg:text-[3.4rem]">
              <span className="block">Small act.</span>
              <span className="block text-gradient-red">Meaningful impact.</span>
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-content-secondary">
              Blood donation information is only useful when it is accurate and grounded in the
              guidance of qualified professionals. Here is what to keep in mind before you take the
              next step.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {education.map((item, index) => (
              <Reveal key={item.id} delay={0.08 * index} className="h-full">
                <GlassCard className="h-full p-6">
                  <span
                    aria-hidden
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-blush shadow-glow-red-sm"
                  >
                    <item.icon className="h-5 w-5 text-crimson-bright" />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-semibold tracking-[-0.01em] text-content-primary">
                    {item.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-content-secondary">{item.body}</p>
                </GlassCard>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={0.12} className="relative">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-line bg-blush-soft px-6 py-14">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_110%,rgba(11,95,165,0.12),transparent_64%)]" />
            <div className="relative">
              <GlassDroplet />
            </div>
            <p className="relative mx-auto mt-10 max-w-xs text-center text-xs leading-relaxed text-content-secondary/80">
              A translucent glass droplet — a reminder that donation decisions always belong with
              qualified healthcare professionals.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
