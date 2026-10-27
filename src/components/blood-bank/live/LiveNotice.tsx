import { AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type LiveNoticeTone = "info" | "warn";

export interface LiveNoticeMessage {
  /** Stable key so re-triggering the same notice re-renders predictably. */
  id: string;
  tone: LiveNoticeTone;
  title: string;
  body: string;
}

/**
 * Inline, dismissible status banner for the Live modules.
 *
 * Used only to say something true: that an action needs a credential, a sensor
 * feed or an integration that is not configured yet — including the concrete
 * configuration path. It is never used to imitate success.
 */
export function LiveNotice({
  message,
  onDismiss,
}: {
  message: LiveNoticeMessage;
  onDismiss: () => void;
}) {
  const Icon = message.tone === "warn" ? AlertTriangle : Info;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4",
        message.tone === "warn"
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-line bg-white/80 text-content-primary",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] font-bold uppercase tracking-widest">{message.title}</p>
        <p className="mt-1 text-[0.7rem] leading-relaxed">{message.body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="shrink-0 rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** Notice shown when an action needs something the deployment does not have yet. */
export function notConfigured(title: string, body: string): LiveNoticeMessage {
  return { id: `nc-${title}`, tone: "warn", title, body };
}
