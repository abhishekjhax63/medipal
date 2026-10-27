import { motion } from "framer-motion";
import { MousePointer2, ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { AIChatInterface } from "@/components/ai-doctor/AIChatInterface";
import { InteractiveAICharacter } from "@/components/ai-doctor/InteractiveAICharacter";
import { SUGGESTED_PROMPTS, type PromptDefinition } from "@/components/ai-doctor/prompts";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { fadeUp, staggerContainer } from "@/lib/animations";
import { cn } from "@/lib/cn";
import { getAIStatus } from "@/services/aiDoctorService";
import type { PendingPrompt } from "@/types/aiDoctor";

/** Welcome eyebrow, headline, supporting copy and honest status label. */
function WelcomeHeader() {
  return (
    <header className="mx-auto mb-10 max-w-3xl text-center sm:mb-14">
      <Reveal>
        <p className="eyebrow text-crimson-soft">MEDIPAL AI DOCTOR</p>
      </Reveal>
      <Reveal delay={0.08}>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-content-primary sm:text-5xl lg:text-6xl">
          Hello, I'm <span className="text-gradient-red">MEDIPAL.</span>
        </h1>
      </Reveal>
      <Reveal delay={0.16}>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-content-secondary sm:text-lg">
          Your AI health companion for understanding health information, exploring common health
          questions, and preparing for conversations with healthcare professionals.
        </p>
      </Reveal>
      <Reveal delay={0.24}>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <span className="chip border-crimson/20 text-crimson-soft">
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-crimson-bright/60 motion-safe:animate-pulse-ring" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-crimson shadow-[0_0_10px_2px_rgba(11,95,165,0.55)]" />
            </span>
            AI HEALTH ASSISTANT
          </span>
          <span className="chip">
            <ShieldCheck className="h-3.5 w-3.5 text-crimson-soft" aria-hidden />
            HEALTH INFORMATION
          </span>
        </div>
      </Reveal>
    </header>
  );
}

/** Five premium glass entry points; each one starts a labelled demo conversation. */
function PromptGrid({ onSelect }: { onSelect: (definition: PromptDefinition) => void }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {SUGGESTED_PROMPTS.map((definition) => {
        const Icon = definition.icon;
        return (
          <motion.div key={definition.id} variants={fadeUp} className="h-full">
            <button
              type="button"
              onClick={() => onSelect(definition)}
              className="group block h-full w-full rounded-3xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-bright focus-visible:ring-offset-2"
            >
              <GlassCard tone="light" hairline className="flex h-full flex-col gap-3 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-crimson/15 bg-blush text-crimson shadow-[0_12px_26px_-18px_rgba(11,95,165,0.65)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="font-display text-base font-semibold text-content-primary">
                  {definition.title}
                </span>
                <span className="text-sm leading-relaxed text-content-secondary">
                  {definition.description}
                </span>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-1 font-manrope text-[0.58rem] uppercase tracking-[0.2em] text-crimson-soft">
                  <MousePointer2 className="h-3 w-3" aria-hidden />
                  Ask this
                </span>
              </GlassCard>
            </button>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/**
 * The AI Doctor environment: a pointer-reactive MEDIPAL character plus a chat
 * surface. It starts airy (large character, prompts below) and folds into a
 * compact character panel beside the conversation once a message is sent.
 */
export function AIDoctorExperience() {
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [conversationActive, setConversationActive] = useState(false);
  /** Mirrors the chat's loading state so the character can visibly react. */
  const [thinking, setThinking] = useState(false);
  const nonceRef = useRef(0);
  const status = useMemo(() => getAIStatus(), []);

  const pushPrompt = useCallback((text: string, submit: boolean) => {
    nonceRef.current += 1;
    setPendingPrompt({ nonce: nonceRef.current, text, submit });
  }, []);

  const handlePromptConsumed = useCallback(() => setPendingPrompt(null), []);
  const handleConversationActiveChange = useCallback((active: boolean) => {
    setConversationActive(active);
  }, []);
  const handleThinkingChange = useCallback((next: boolean) => setThinking(next), []);

  return (
    <section className="section-shell pt-28 pb-24 sm:pt-32 sm:pb-28 lg:pt-36">
      {!conversationActive && <WelcomeHeader />}

      <div
        className={cn(
          "grid gap-10",
          conversationActive
            ? "lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-12"
            : "grid-cols-1",
        )}
      >
        {/* Character */}
        <div className={cn("flex flex-col items-center gap-3", conversationActive && "lg:sticky lg:top-24")}>
          <InteractiveAICharacter compact={conversationActive} thinking={thinking} />
          <Reveal className="max-w-sm text-center">
            <p className="text-[0.7rem] leading-relaxed text-content-secondary">
              MEDIPAL AI is an information assistant, not a medical service. It cannot diagnose,
              prescribe or handle emergencies.
            </p>
          </Reveal>
        </div>

        {/* Prompts (welcome) + chat */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div>{!conversationActive && <PromptGrid onSelect={(definition) => pushPrompt(definition.starter, true)} />}</div>
          <AIChatInterface
            variant={conversationActive ? "panel" : "hero"}
            pendingPrompt={pendingPrompt}
            onPromptConsumed={handlePromptConsumed}
            onConversationActiveChange={handleConversationActiveChange}
            onThinkingChange={handleThinkingChange}
            status={status}
          />
        </div>
      </div>
    </section>
  );
}
