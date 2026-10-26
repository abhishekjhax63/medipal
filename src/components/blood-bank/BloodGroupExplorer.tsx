import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CircleCheckBig, Droplets, RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { bloodGroupInfo, bloodGroupNote, bloodGroups, type BloodGroup } from "@/data/bloodGroups";
import { cn } from "@/lib/cn";
import { fadeUp, staggerContainer } from "@/lib/animations";

function CompatibilityList({ label, groups }: { label: string; groups: BloodGroup[] }) {
  return (
    <div>
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-content-secondary">
        {label}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label={label}>
        {groups.map((group) => (
          <li
            key={group}
            className="rounded-full border border-line bg-blush px-3 py-1 font-display text-xs font-semibold text-content-primary"
          >
            {group}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Educational ABO/Rh explorer. Shows the standard red-cell reference only —
 * never inventory, live availability or donor counts.
 */
export function BloodGroupExplorer() {
  const [selected, setSelected] = useState<BloodGroup | null>(null);
  const reduce = useReducedMotion();
  const info = selected ? bloodGroupInfo[selected] : null;

  return (
    <section id="blood-groups" className="section-shell section-pad scroll-mt-28">
      <SectionHeading
        eyebrow="Blood group explorer"
        title="Understand the eight standard groups"
        description="Select any ABO and Rh category to see a plain-language summary and the standard red-cell donation and receiving references."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          role="group"
          aria-label="Select a blood group"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4"
        >
          {bloodGroups.map((group) => {
            const isSelected = selected === group;
            const negative = group.endsWith("-");
            return (
              <motion.div key={group} variants={fadeUp}>
                <button
                  type="button"
                  onClick={() => setSelected((current) => (current === group ? null : group))}
                  aria-pressed={isSelected}
                  className={cn(
                    "group relative flex w-full flex-col items-start gap-1.5 overflow-hidden rounded-3xl border p-4 text-left transition-all duration-500 ease-smooth",
                    isSelected
                      ? "border-crimson bg-gradient-to-br from-crimson-bright via-crimson to-crimson-soft shadow-glow-red"
                      : "border-line bg-white/70 hover:-translate-y-1 hover:border-crimson/40 hover:bg-white",
                  )}
                >
                  {isSelected && (
                    <CircleCheckBig
                      className="absolute right-3 top-3 h-4 w-4 text-white"
                      aria-hidden
                    />
                  )}

                  <span
                    className={cn(
                      "font-display text-2xl font-semibold tracking-[-0.02em] sm:text-[1.7rem]",
                      isSelected ? "text-white" : "text-content-primary",
                    )}
                  >
                    {group}
                  </span>
                  <span
                    className={cn(
                      "text-[0.55rem] font-medium uppercase tracking-[0.24em]",
                      isSelected ? "text-white/80" : "text-content-secondary",
                    )}
                  >
                    {negative ? "Rh negative" : "Rh positive"}
                  </span>
                  <span
                    className={cn(
                      "text-[0.72rem] leading-snug",
                      isSelected ? "text-white/90" : "text-content-secondary",
                    )}
                  >
                    {bloodGroupInfo[group].tagline}
                  </span>
                </button>
              </motion.div>
            );
          })}
        </motion.div>

        <GlassCard hairline className="flex flex-col p-7 sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">
                {selected ? "Selected group" : "Reference panel"}
              </p>
              <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.03em] text-content-primary">
                {selected ?? "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              disabled={!selected}
              className="btn-ghost shrink-0 px-3 py-2 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Clear selection
            </button>
          </div>

          <div className="divider-glass my-6" />

          {info ? (
            <motion.div
              key={info.group}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-1 flex-col gap-7"
            >
              <p className="text-sm leading-relaxed text-content-secondary">{info.summary}</p>
              <div className="grid gap-6 sm:grid-cols-2">
                <CompatibilityList label="Can donate red cells to" groups={info.canDonateTo} />
                <CompatibilityList label="Can receive red cells from" groups={info.canReceiveFrom} />
              </div>
            </motion.div>
          ) : (
            <div className="flex flex-1 flex-col items-start justify-center gap-4 py-6">
              <span
                aria-hidden
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-blush shadow-glow-red-sm"
              >
                <Droplets className="h-5 w-5 text-crimson-bright" />
              </span>
              <p className="max-w-sm text-sm leading-relaxed text-content-secondary">
                Select a blood group tile to see its summary and standard red-cell compatibility
                reference. Use “Clear selection” at any time to reset the panel.
              </p>
            </div>
          )}

          <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-content-secondary/80">
            {bloodGroupNote}
          </p>
        </GlassCard>
      </div>
    </section>
  );
}
