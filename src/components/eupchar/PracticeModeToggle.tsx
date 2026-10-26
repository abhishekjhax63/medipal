import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";
import { PRACTICE_BANNER } from "@/data/eupchar/practiceData";
import { setPracticeMode } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { EuNotice } from "@/components/eupchar/ui";

/**
 * Practice-mode switch.
 *
 * Off by default, so the honest "not configured" states are what a visitor sees
 * first. Turning it on never changes what MEDIPAL claims — it only substitutes
 * clearly-labelled placeholders so the full booking funnel can be walked through
 * without a connected backend.
 */
export function PracticeModeToggle({ className }: { className?: string }) {
  const { practiceMode } = useEuState();

  return (
    <button
      type="button"
      onClick={() => setPracticeMode(!practiceMode)}
      aria-pressed={practiceMode}
      className={cn(
        "eu-btn gap-2 border px-3.5 py-2 text-[0.78rem]",
        practiceMode
          ? "border-[#c7b6f0] bg-[#f3efff] text-[#5b3fb8]"
          : "border-eu-border bg-eu-bg text-eu-muted hover:border-eu-red hover:text-eu-red-deep",
        className,
      )}
      title={
        practiceMode
          ? "Turn practice mode off"
          : "Turn practice mode on to walk through booking with labelled placeholders"
      }
    >
      <FlaskConical className="h-3.5 w-3.5" aria-hidden />
      {practiceMode ? "Practice mode: on" : "Practice mode: off"}
    </button>
  );
}

/** Full-width explanation shown on the screens the toggle affects most. */
export function PracticeModeExplainer({ className }: { className?: string }) {
  const { practiceMode } = useEuState();
  if (!practiceMode) return null;
  return (
    <EuNotice tone="practice" title="Practice mode is on" className={className}>
      {PRACTICE_BANNER}
    </EuNotice>
  );
}
