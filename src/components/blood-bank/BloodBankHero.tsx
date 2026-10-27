import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BookOpen, HeartHandshake, Search, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { BloodDNAVisual } from "@/components/blood-bank/BloodDNAVisual";
import { scrollToId } from "@/components/blood-bank/bloodBankScroll";
import { EASE_SMOOTH, fadeUp, staggerContainer } from "@/lib/animations";

const trustChips = ["ABO & Rh guidance", "Donor interest registration", "AI health companion"] as const;

/**
 * Immersive full-height opening for the Blood Bank experience.
 * Pointer reactivity lives entirely inside the DNA visual.
 */
export function BloodBankHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden pb-16 pt-28 sm:pt-32 lg:pb-24">
      {/* Atmospheric blush / crimson illumination on the light foundation */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(118%_82%_at_16%_-12%,rgba(233,30,77,0.14),transparent_58%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(72%_62%_at_92%_16%,rgba(255,231,237,0.72),transparent_60%)]" />
        <div className="absolute -left-24 top-8 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(240,68,82,0.16),transparent_66%)] blur-3xl motion-safe:animate-drift-glow" />
        <div className="absolute -right-32 bottom-0 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(194,24,58,0.14),transparent_68%)] blur-3xl motion-safe:animate-drift-glow [animation-delay:-9s]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent" />
      </div>

      <div className="section-shell relative grid items-center gap-14 lg:grid-cols-[1.04fr_1fr] lg:gap-10">
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          animate="show"
          className="relative z-10 max-w-2xl"
        >
          <motion.p variants={fadeUp} className="eyebrow">
            MEDIPAL BLOOD BANK
          </motion.p>

          <motion.h1
            variants={fadeUp}
            className="mt-6 font-display text-[clamp(2.6rem,7vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-content-primary"
          >
            Give Blood. <span className="text-gradient-red">Save Lives.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-7 max-w-xl text-base leading-relaxed text-content-secondary sm:text-[1.08rem]"
          >
            Connect with blood donors, discover verified availability, and help patients find the
            support they need.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/blood-bank/live" className="btn-primary group">
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              BloodBridge Live
              <ArrowRight
                className="h-4 w-4 transition-transform duration-300 ease-smooth group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
            <button
              type="button"
              onClick={() => scrollToId("availability-search")}
              className="btn-secondary group"
            >
              <Search className="h-4 w-4" aria-hidden />
              Find Blood
            </button>
            <button
              type="button"
              onClick={() => scrollToId("donor-registration")}
              className="btn-secondary"
            >
              <HeartHandshake className="h-4 w-4" aria-hidden />
              Become a Donor
            </button>
            <button type="button" onClick={() => scrollToId("blood-groups")} className="btn-ghost group">
              <BookOpen className="h-4 w-4" aria-hidden />
              Explore Blood Groups
              <ArrowRight
                className="h-4 w-4 transition-transform duration-300 ease-smooth group-hover:translate-x-1"
                aria-hidden
              />
            </button>
          </motion.div>

          <motion.ul variants={fadeUp} className="mt-10 flex flex-wrap gap-2.5" aria-label="What MEDIPAL offers">
            {trustChips.map((chip) => (
              <li key={chip} className="chip">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-crimson-bright" />
                {chip}
              </li>
            ))}
          </motion.ul>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.1, ease: EASE_SMOOTH, delay: 0.15 }}
          className="relative z-0 lg:-mr-10 xl:-mr-20"
        >
          <BloodDNAVisual />
        </motion.div>
      </div>
    </section>
  );
}
