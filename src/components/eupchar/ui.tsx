/**
 * Shared E-UPCHAR UI primitives.
 *
 * Every screen builds from these so the light clinical language, the honest
 * unavailable states and the "practice" labelling can never drift apart.
 */

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { EASE_SMOOTH } from "@/lib/animations";
import { cn } from "@/lib/cn";
import { formatPaise } from "@/lib/eupchar/format";
import { E_UPCHAR_COPY, type PriceVerificationStatus, type ServicePrice } from "@/types/eupchar";

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function EuCard({
  children,
  className,
  interactive = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: "div" | "li" | "article";
}) {
  return (
    <Tag
      className={cn(
        "eu-surface",
        interactive &&
          "transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-[#c9ccd0] hover:shadow-eu-lift",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function EuSectionTitle({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-eu-text sm:text-xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-eu-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export type BadgeTone = "neutral" | "red" | "ok" | "warn" | "practice";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-eu-border bg-eu-surface text-eu-muted",
  red: "border-[#f6c9c1] bg-[#fdf0ed] text-eu-red-deep",
  ok: "border-[#bfe3ce] bg-[#eefaf2] text-eu-ok",
  warn: "border-[#f0dcb4] bg-[#fdf6e6] text-eu-warn",
  practice: "border-[#c7b6f0] bg-[#f3efff] text-[#5b3fb8]",
};

export function EuBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold tracking-wide",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Marks any amount that is a practice placeholder rather than a verified price. */
export function EuPracticeBadge() {
  return (
    <EuBadge tone="practice">
      <Lock className="h-3 w-3" aria-hidden />
      Practice
    </EuBadge>
  );
}

/* ------------------------------------------------------------------ */
/* Notices                                                             */
/* ------------------------------------------------------------------ */

export type NoticeTone = "info" | "warn" | "error" | "practice";

const noticeConfig: Record<
  NoticeTone,
  { icon: LucideIcon; wrap: string; iconClass: string; title: string }
> = {
  info: {
    icon: Info,
    wrap: "border-[#cfd8e6] bg-[#f4f7fc]",
    iconClass: "text-[#2f5aa8]",
    title: "text-[#1f3d75]",
  },
  warn: {
    icon: AlertTriangle,
    wrap: "border-[#f0dcb4] bg-[#fdf6e6]",
    iconClass: "text-eu-warn",
    title: "text-[#8a5200]",
  },
  error: {
    icon: AlertTriangle,
    wrap: "border-[#f3c4c0] bg-[#fdf1f0]",
    iconClass: "text-eu-red-deep",
    title: "text-[#8f1f2c]",
  },
  practice: {
    icon: Lock,
    wrap: "border-[#d8cbf7] bg-[#f7f4ff]",
    iconClass: "text-[#5b3fb8]",
    title: "text-[#48319b]",
  },
};

export function EuNotice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const config = noticeConfig[tone];
  const Icon = config.icon;
  return (
    <div className={cn("rounded-2xl border p-4", config.wrap, className)} role={tone === "error" ? "alert" : undefined}>
      <div className="flex gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.iconClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          {title && <p className={cn("text-sm font-semibold", config.title)}>{title}</p>}
          {children && (
            <div className={cn("text-sm leading-relaxed", title ? "mt-1 text-eu-muted" : "text-eu-muted")}>
              {children}
            </div>
          )}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

/** Persistent label required whenever Practice mode is on. */
export function EuPracticeBanner({ message }: { message: string }) {
  return (
    <EuNotice tone="practice" title="Practice mode is on" className="mb-5">
      {message}
    </EuNotice>
  );
}

/* ------------------------------------------------------------------ */
/* Empty states                                                        */
/* ------------------------------------------------------------------ */

export function EuEmptyState({
  icon: Icon = Info,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-eu-border bg-eu-surface px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-eu-border bg-eu-bg text-eu-muted">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-4 text-base font-semibold text-eu-text">{title}</p>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-eu-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export function EuSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="eu-skeleton h-3.5"
          style={{ width: `${88 - index * 9}%` }}
        />
      ))}
    </div>
  );
}

export function EuCardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, index) => (
        <EuCard key={index} className="p-5">
          <EuSkeleton lines={3} />
        </EuCard>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Price                                                               */
/* ------------------------------------------------------------------ */

/** Copy + tone for each honest price state (spec §Issue-3D). */
export function priceStateLabel(status: PriceVerificationStatus): {
  tone: BadgeTone;
  label: string;
} | null {
  switch (status) {
    case "verified":
      return { tone: "ok", label: E_UPCHAR_COPY.priceProviderConfirmed };
    case "published":
      return { tone: "neutral", label: E_UPCHAR_COPY.pricePublished };
    case "practice":
      return { tone: "practice", label: "Practice amount" };
    default:
      return null;
  }
}

/**
 * Renders exactly one of the honest price states. An unknown price is never
 * rendered as `₹0`, and an unconfirmed figure is never rendered as a price.
 */
export function EuPrice({
  paise,
  status = "unverified",
  size = "md",
}: {
  paise: number | null;
  status?: PriceVerificationStatus;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  } as const;

  // State (2): free under an applicable programme — never shown as ₹0.
  if (status === "free_programme") {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-2">
        <span className={cn("font-semibold tracking-[-0.01em] text-eu-text", sizes[size])}>
          {E_UPCHAR_COPY.priceFreeProgramme}
        </span>
        <EuBadge tone="ok">Programme</EuBadge>
      </span>
    );
  }

  // States (3) and (4): a figure must not be shown as a price.
  if (status === "awaiting_confirmation" || status === "unverified") {
    return (
      <span className="text-[0.8rem] font-medium leading-snug text-eu-muted">
        {status === "awaiting_confirmation"
          ? E_UPCHAR_COPY.priceNotConfirmed
          : E_UPCHAR_COPY.priceUnavailable}
      </span>
    );
  }

  const formatted = formatPaise(paise);
  if (formatted === null) {
    return (
      <span className="text-[0.8rem] font-medium leading-snug text-eu-muted">
        {E_UPCHAR_COPY.priceUnavailable}
      </span>
    );
  }

  const badge = priceStateLabel(status);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-2">
      <span className={cn("font-semibold tracking-[-0.01em] text-eu-text", sizes[size])}>{formatted}</span>
      {badge && (
        <EuBadge tone={badge.tone}>
          {badge.tone === "ok" && <CheckCircle2 className="h-3 w-3" aria-hidden />}
          {badge.label}
        </EuBadge>
      )}
    </span>
  );
}

/**
 * The provenance line that must accompany a real price: who published it, where,
 * when it was last checked, any published conditions, and a stale warning.
 */
export function EuPriceProvenance({
  price,
  className,
}: {
  price: ServicePrice | null;
  className?: string;
}) {
  if (!price) return null;
  if (price.verificationStatus === "practice") return null;

  const isFree = price.verificationStatus === "free_programme";
  if (!isFree && price.verificationStatus !== "verified" && price.verificationStatus !== "published") {
    return null;
  }

  return (
    <div className={cn("mt-2 space-y-1.5 text-[0.75rem] leading-relaxed text-eu-muted", className)}>
      {price.sourceName && (
        <p>
          Source:{" "}
          {price.sourceUrl ? (
            <a
              href={price.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-eu-red-deep underline-offset-2 hover:underline"
            >
              {price.sourceName}
            </a>
          ) : (
            <span className="font-medium text-eu-text">{price.sourceName}</span>
          )}
          {price.lastVerifiedOn ? ` · checked ${price.lastVerifiedOn}` : ""}
        </p>
      )}
      {price.conditions && <p>{price.conditions}</p>}
      {price.staleDetectedOn && (
        <p className="font-medium text-eu-warn">{E_UPCHAR_COPY.priceSourceStale}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation helpers                                                  */
/* ------------------------------------------------------------------ */

export function EuBreadcrumb({
  items,
}: {
  items: readonly { label: string; to?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-[0.78rem] text-eu-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {item.to ? (
              <Link to={item.to} className="rounded transition-colors hover:text-eu-red-deep">
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-eu-text">{item.label}</span>
            )}
            {index < items.length - 1 && (
              <span aria-hidden className="text-eu-border">
                /
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function EuStepper({
  steps,
  current,
}: {
  steps: readonly string[];
  current: number;
}) {
  return (
    <ol className="eu-scroll-x mb-6 pb-1" aria-label="Booking progress">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "active" : "todo";
        return (
          <li key={step} className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-[0.68rem] font-bold",
                state === "done" && "border-eu-ok bg-eu-ok text-white",
                state === "active" && "border-eu-red bg-eu-red text-white",
                state === "todo" && "border-eu-border bg-eu-bg text-eu-muted",
              )}
              aria-current={state === "active" ? "step" : undefined}
            >
              {state === "done" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-[0.78rem] font-medium",
                state === "todo" ? "text-eu-muted" : "text-eu-text",
              )}
            >
              {step}
            </span>
            {index < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-5 bg-eu-border" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Motion helpers                                                      */
/* ------------------------------------------------------------------ */

export function EuReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay, ease: EASE_SMOOTH }}
    >
      {children}
    </motion.div>
  );
}

export function EuStagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.1 }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.05 } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function EuStaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_SMOOTH } },
      }}
    >
      {children}
    </motion.div>
  );
}
