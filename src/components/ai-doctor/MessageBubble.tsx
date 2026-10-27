import { Check, Copy, Sparkles, User, Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/types/aiDoctor";

type MessageBubbleProps = {
  message: ChatMessage;
  /** Retained for compatibility; MEDIPAL never generates a local medical reply. */
  demo?: boolean;
  copied: boolean;
  onCopy: (message: ChatMessage) => void;
};

function formatTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
      new Date(timestamp),
    );
  } catch {
    return "";
  }
}

/** A single conversation turn — user (crimson glass) or assistant (white glass). */
export function MessageBubble({ message, demo = false, copied, onCopy }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-crimson/20 bg-white/85 text-crimson shadow-[0_10px_24px_-14px_rgba(10,61,117,0.7)]">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
      )}

      <div className={cn("flex max-w-[86%] flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
        <div className={cn("flex items-center gap-2", isUser && "flex-row-reverse")}>
          <span className="font-manrope text-[0.6rem] uppercase tracking-[0.2em] text-ink/45">
            {isUser ? "You" : "MEDIPAL"}
          </span>
          <time className="font-manrope text-[0.6rem] text-ink/35" dateTime={new Date(message.createdAt).toISOString()}>
            {formatTime(message.createdAt)}
          </time>
        </div>

        <div
          className={cn(
            "flex flex-col gap-2 whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-relaxed text-ink shadow-[0_18px_48px_-32px_rgba(6,42,78,0.65)]",
            isUser
              ? "rounded-br-lg border border-crimson/25 bg-[linear-gradient(135deg,rgba(46,134,222,0.14),rgba(10,61,117,0.2))] backdrop-blur-sm"
              : "glass-light rounded-bl-lg",
          )}
        >
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-1">
              {message.attachments.map((attachment, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-line bg-white/50 px-2 py-1 text-[0.7rem] text-content-secondary">
                  {attachment.kind === "image" ? <ImageIcon className="h-3 w-3" aria-hidden /> : <VideoIcon className="h-3 w-3" aria-hidden />}
                  <span className="max-w-[120px] truncate">{attachment.name}</span>
                </div>
              ))}
            </div>
          )}
          {message.content}
        </div>

        {!isUser && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onCopy(message)}
              className="inline-flex items-center gap-1.5 rounded-full border border-crimson/20 bg-white/70 px-3 py-1 font-manrope text-[0.58rem] uppercase tracking-[0.16em] text-ink/60 transition hover:border-crimson/40 hover:text-ink"
            >
              {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
            {demo && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-crimson/25 bg-crimson/10 px-3 py-1 font-manrope text-[0.58rem] uppercase tracking-[0.16em] text-crimson-soft">
                Demonstration response
              </span>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white/85 text-ink/60">
          <User className="h-4 w-4" aria-hidden />
        </span>
      )}
    </div>
  );
}
