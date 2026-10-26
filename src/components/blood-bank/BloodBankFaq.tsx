import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { EASE_SMOOTH } from "@/lib/animations";
import { cn } from "@/lib/cn";

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

const faqs: readonly FaqItem[] = [
  {
    id: "what",
    question: "What is MEDIPAL Blood Bank?",
    answer:
      "MEDIPAL Blood Bank is the blood donation information experience within the MEDIPAL platform. It brings blood group references, donation awareness and an interest-registration flow together in one place so visitors can find clear, general guidance.",
  },
  {
    id: "interest",
    question: "How can I express interest in donating blood?",
    answer:
      "Use the donor interest form on this page to register your interest and choose how you would prefer to be contacted. In this build it is a demonstration flow, so nothing is stored or transmitted. For an actual donation, please contact an authorised blood bank or hospital.",
  },
  {
    id: "groups",
    question: "Which blood groups can I explore?",
    answer:
      "You can explore all eight standard ABO and Rh categories — A+, A-, B+, B-, AB+, AB-, O+ and O-. Selecting any group shows a plain-language summary along with the standard red-cell donation and receiving references.",
  },
  {
    id: "availability",
    question: "Does MEDIPAL currently display live blood availability?",
    answer:
      "No. Live blood availability depends on a verified, connected data source, and none is connected in this build. The availability search interface is in place and ready, but it will only show real results once an authorised data source is integrated.",
  },
  {
    id: "data",
    question: "How will my information be handled?",
    answer:
      "The donor interest form in this build is a frontend-only demonstration: what you type is not stored and is not transmitted anywhere. Any future data collection would be governed by explicit consent and a verified data source.",
  },
  {
    id: "guidance",
    question: "Where can I get professional medical guidance?",
    answer:
      "MEDIPAL provides general information only and does not replace professional care. For eligibility, donation suitability or any medical question, consult a qualified healthcare professional or an authorised blood donation centre. In an emergency, contact your local emergency services.",
  },
];

/** Accessible single-open accordion with animated height transitions. */
export function BloodBankFaq() {
  const [openId, setOpenId] = useState<string | null>("what");

  return (
    <section id="faq" className="section-shell section-pad scroll-mt-28">
      <SectionHeading
        eyebrow="Questions"
        title="Frequently asked questions"
        description="Short, accurate answers about how the MEDIPAL Blood Bank experience works today."
      />

      <div className="mt-12 space-y-3">
        {faqs.map((item, index) => {
          const isOpen = openId === item.id;
          const triggerId = `faq-trigger-${item.id}`;
          const panelId = `faq-panel-${item.id}`;

          return (
            <Reveal key={item.id} delay={0.05 * index}>
              <div
                className={cn(
                  "overflow-hidden rounded-3xl border backdrop-blur-xl transition-colors duration-500 ease-smooth",
                  isOpen
                    ? "border-crimson/40 bg-white/85"
                    : "border-line bg-white/70 hover:border-crimson/30",
                )}
              >
                <h3>
                  <button
                    type="button"
                    id={triggerId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenId((current) => (current === item.id ? null : item.id))}
                    className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left sm:px-7"
                  >
                    <span className="font-display text-base font-medium tracking-[-0.01em] text-content-primary sm:text-lg">
                      {item.question}
                    </span>
                    <motion.span
                      aria-hidden
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.32, ease: EASE_SMOOTH }}
                      className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ease-smooth",
                        isOpen
                          ? "border-crimson/50 bg-crimson/12 text-crimson"
                          : "border-line bg-white/70 text-content-secondary",
                      )}
                    >
                      <Plus className="h-4 w-4" />
                    </motion.span>
                  </button>
                </h3>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="panel"
                      id={panelId}
                      role="region"
                      aria-labelledby={triggerId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.36, ease: EASE_SMOOTH }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-6 text-sm leading-relaxed text-content-secondary sm:px-7">
                        {item.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
