import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BookOpen, HeartHandshake, Search, type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { scrollToId } from "@/components/blood-bank/bloodBankScroll";
import { fadeUp, staggerContainer } from "@/lib/animations";

type QuickAction = {
  id: string;
  title: string;
  description: string;
  cta: string;
  target: string;
  icon: LucideIcon;
};

const actions: readonly QuickAction[] = [
  {
    id: "resources",
    title: "Find Blood Resources",
    description: "Explore blood group information and find out how blood availability services can work.",
    cta: "Explore Resources",
    target: "availability-search",
    icon: Search,
  },
  {
    id: "donate",
    title: "Donate Blood",
    description: "Learn about blood donation and register your interest in helping others.",
    cta: "Register Interest",
    target: "donor-registration",
    icon: HeartHandshake,
  },
  {
    id: "guide",
    title: "Blood Group Guide",
    description: "Understand the eight standard ABO and Rh blood group categories.",
    cta: "View Blood Groups",
    target: "blood-groups",
    icon: BookOpen,
  },
];

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="relative mb-6 inline-flex h-14 w-14 items-center justify-center">
      <span
        aria-hidden
        className="absolute left-2 top-2 h-14 w-14 rounded-2xl border border-line bg-white/70"
      />
      <span
        aria-hidden
        className="absolute inset-0 rounded-2xl border border-line bg-blush shadow-glow-red-sm transition-transform duration-500 ease-smooth group-hover:-translate-y-0.5"
      >
        <span className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_32%_22%,rgba(240,68,82,0.4),transparent_72%)]" />
      </span>
      <Icon className="relative h-6 w-6 text-content-primary" aria-hidden />
    </span>
  );
}

/** Three entry-point panels that route visitors to the key Blood Bank sections. */
export function QuickActions() {
  const reduce = useReducedMotion();

  return (
    <section className="section-shell section-pad">
      <SectionHeading
        eyebrow="Quick actions"
        title="Start where it matters to you"
        description="Three clear paths through the blood donation information currently available on MEDIPAL."
      />

      <motion.div
        variants={staggerContainer}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-14 grid gap-6 md:grid-cols-3"
      >
        {actions.map((action) => (
          <motion.div key={action.id} variants={fadeUp} className="h-full">
            <GlassCard hairline className="group flex h-full flex-col p-7 sm:p-8">
              <IconTile icon={action.icon} />
              <h3 className="font-display text-xl font-semibold tracking-[-0.01em] text-content-primary">
                {action.title}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-content-secondary">
                {action.description}
              </p>
              <button
                type="button"
                onClick={() => scrollToId(action.target)}
                className="btn-secondary mt-7 w-full justify-center group/btn"
              >
                {action.cta}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 ease-smooth group-hover/btn:translate-x-1"
                  aria-hidden
                />
              </button>
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
