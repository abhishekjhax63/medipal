import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BookOpen, HeartHandshake, Search, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { BloodBankHeroVideo } from "@/components/blood-bank/BloodBankHeroVideo";
import { scrollToId } from "@/components/blood-bank/bloodBankScroll";
import { EASE_SMOOTH, fadeUp, staggerContainer } from "@/lib/animations";

const trustChips = ["ABO & Rh guidance", "Donor interest registration", "AI health companion"] as const;

/**
 * Immersive full-height opening for the Blood Bank experience.
 * The hero centrepiece is the framed video visual; playback behaviour lives
 * entirely inside it.
 */
export function BloodBankHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative isolate flex items-center overflow-hidden py-16 sm:py-20 lg:py-24">
      {/* A calm, static wash. The drifting blooms and glow rings that used to sit
          behind this band were removed with the rest of the decorative layer:
          they competed with the search panel directly above. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(96%_70%_at_14%_-10%,rgba(18,119,90,0.07),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_54%_at_94%_10%,rgba(255,231,237,0.6),transparent_62%)]" />
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

          <motion.h2
            variants={fadeUp}
            className="mt-6 font-display text-[clamp(2.1rem,5vw,3.4rem)] font-semibold leading-[1.06] tracking-[-0.03em] text-content-primary"
          >
            Give Blood. <span className="text-gradient-red">Save Lives.</span>
          </motion.h2>

          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-xl text-base leading-relaxed text-content-secondary sm:text-[1.05rem]"
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
          className="relative z-0 lg:ml-0"
        >
          <BloodBankHeroVideo />
        </motion.div>
      </div>
    </section>
  );
}
