import { cn } from "@/lib/cn";

type MedipalLogoProps = {
  /** Rendered square size in pixels. */
  size?: number;
  className?: string;
  /** Include the MEDIPAL wordmark beside the mark. */
  withWordmark?: boolean;
  /**
   * Wordmark tone. Every MEDIPAL surface is light now, so both tones render
   * dark ink text — `light` adds the crimson subtitle used by the AI Doctor.
   */
  tone?: "dark" | "light";
};

/**
 * MEDIPAL mark: a medical cross crossed by a heartbeat trace,
 * set in a rounded crimson glass tile.
 */
export function MedipalLogo({
  size = 38,
  className,
  withWordmark = false,
  tone = "dark",
}: MedipalLogoProps) {
  const uniqueId = `medipal-mark-${tone}`;

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label="MEDIPAL logo"
        className="shrink-0 drop-shadow-[0_6px_16px_rgba(233,30,77,0.32)]"
      >
        <defs>
          <linearGradient id={`${uniqueId}-fill`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F04452" />
            <stop offset="52%" stopColor="#E91E4D" />
            <stop offset="100%" stopColor="#C2183A" />
          </linearGradient>
          <radialGradient id={`${uniqueId}-gloss`} cx="30%" cy="18%" r="75%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        <rect x="1" y="1" width="46" height="46" rx="14" fill={`url(#${uniqueId}-fill)`} />
        <rect
          x="1"
          y="1"
          width="46"
          height="46"
          rx="14"
          fill={`url(#${uniqueId}-gloss)`}
          opacity="0.75"
        />
        <rect
          x="1"
          y="1"
          width="46"
          height="46"
          rx="14"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1"
        />

        {/* medical cross */}
        <path
          d="M21.6 11.5h4.8v8.7h8.6v4.8h-8.6v10.5h-4.8V25h-8.6v-4.8h8.6z"
          fill="rgba(255,255,255,0.94)"
        />

        {/* heartbeat trace */}
        <path
          d="M9 24.2h4.6l2.4-4.9 3.5 10.2 3.2-7.1 2 1.8h5.6"
          fill="none"
          stroke="rgba(255,255,255,0.95)"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />

        {/* AI node accent */}
        <circle cx="36.5" cy="34.5" r="2.6" fill="rgba(255,255,255,0.9)" />
        <circle cx="30.5" cy="34.5" r="1.3" fill="rgba(255,255,255,0.6)" />
      </svg>

      {withWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "font-display text-[1.05rem] font-semibold tracking-[0.22em]",
              tone === "dark" ? "text-content-primary" : "text-ink",
            )}
          >
            MEDIPAL
          </span>
          <span
            className={cn(
              "mt-1 font-manrope text-[0.55rem] uppercase tracking-[0.3em]",
              tone === "dark" ? "text-content-secondary" : "text-crimson-soft",
            )}
          >
            Health Platform
          </span>
        </span>
      )}
    </span>
  );
}
