import { ClipboardList, FlaskConical, HeartPulse, BookOpen, Stethoscope, type LucideIcon } from "lucide-react";
import type { DemoIntent } from "@/types/aiDoctor";

export type PromptId = "condition" | "term" | "visit" | "lab" | "lifestyle";

export type PromptDefinition = {
  id: PromptId;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Starter question pushed into the composer (and sent) when the card is used. */
  starter: string;
};

/**
 * The five entry points shown in the welcome state. Every starter is a safe,
 * non-diagnostic request for general information — none asks for a diagnosis,
 * a prescription or a dosage.
 */
export const SUGGESTED_PROMPTS: PromptDefinition[] = [
  {
    id: "condition",
    title: "Understand a Health Condition",
    description: "Learn how a common health condition is generally understood.",
    icon: Stethoscope,
    starter: "Can you explain how a common health condition such as type 2 diabetes is generally understood?",
  },
  {
    id: "term",
    title: "Explain a Medical Term",
    description: "Make sense of a term you have seen on a report or heard in a conversation.",
    icon: BookOpen,
    starter: "What does the medical term hypertension generally mean?",
  },
  {
    id: "visit",
    title: "Prepare for a Doctor Visit",
    description: "Get organised so your appointment covers what matters to you.",
    icon: ClipboardList,
    starter: "How should I prepare questions for an upcoming doctor visit?",
  },
  {
    id: "lab",
    title: "Understand a Lab Test",
    description: "Learn what a common laboratory test is generally used for.",
    icon: FlaskConical,
    starter: "Can you explain what a general laboratory test such as a complete blood count is used for?",
  },
  {
    id: "lifestyle",
    title: "Healthy Lifestyle Habits",
    description: "Everyday habits around sleep, nutrition, movement and prevention.",
    icon: HeartPulse,
    starter: "What are some healthy lifestyle habits I can build into my daily routine?",
  },
];

const FOLLOW_UPS: Record<DemoIntent, readonly [string, string, string]> = {
  symptoms: [
    "Which symptoms are considered urgent?",
    "How should I keep track of my symptoms?",
    "When should I see a doctor?",
  ],
  general: [
    "How can I improve my sleep?",
    "What does a balanced diet look like?",
    "How much should I move each day?",
  ],
  medicine: [
    "What should I ask about side effects?",
    "Can I take this medicine with food?",
    "How do I store medicines safely?",
  ],
  visit: [
    "What should I bring to my appointment?",
    "What questions should I ask?",
    "How do I describe my symptoms clearly?",
  ],
  default: [
    "Share some general health information",
    "Understand my symptoms",
    "How do I prepare for a doctor visit?",
  ],
};

/** Three short follow-up chips shown after an assistant reply. */
export function followUpsFor(intent: DemoIntent | undefined): string[] {
  return [...FOLLOW_UPS[intent ?? "default"]];
}
