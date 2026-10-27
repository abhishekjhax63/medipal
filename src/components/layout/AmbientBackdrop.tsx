import { cn } from "@/lib/cn";

type AmbientBackdropProps = {
  variant?: "blood" | "ai" | "eupchar" | "ambulance";
};

/**
 * Full-viewport atmospheric lighting behind every route.
 *
 * All variants sit on the shared navy / deep-blue / aqua foundation, but each
 * keeps a distinct personality:
 *   `blood`   — cool clinical wash with a deep-blue bloom and aqua lift
 *   `ai`      — cool pearl white with an aqua light (intelligent, futuristic)
 *   `eupchar` — near-white with the faintest blue tint (clinical, bookable)
 *
 * Everything here is decorative and lives behind the content: the wrapper is
 * `fixed inset-0 -z-10` and `pointer-events-none`, so it can never intercept a
 * click or push the layout around.
 */
export function AmbientBackdrop({ variant = "blood" }: AmbientBackdropProps) {
  if (variant === "eupchar") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white">
        <div className="absolute -left-40 top-[-18rem] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(11,95,165,0.08),transparent_66%)] blur-3xl" />
        <div className="absolute -right-44 top-32 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(14,154,167,0.07),transparent_68%)] blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-[26rem] bg-[linear-gradient(180deg,#f4f8fc,transparent)]" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(221,229,238,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(221,229,238,0.6) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(120% 60% at 50% 0%, black, transparent 68%)",
            WebkitMaskImage: "radial-gradient(120% 60% at 50% 0%, black, transparent 68%)",
          }}
        />
      </div>
    );
  }

  if (variant === "ambulance") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#F7FAFD]">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-12%,rgba(11,95,165,0.14),transparent_60%)]" />
        <div className="absolute -left-40 top-[-14rem] h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(circle,rgba(46,134,222,0.16),transparent_64%)] blur-3xl motion-safe:animate-drift-glow" />
        <div className="absolute -right-48 top-24 h-[44rem] w-[44rem] rounded-full bg-[radial-gradient(circle,rgba(14,154,167,0.12),transparent_66%)] blur-3xl motion-safe:animate-drift-glow [animation-delay:-7s]" />

        {/* A calm transit grid — a suggestion of routes, nothing that moves. */}
        <svg className="absolute inset-0 h-full w-full opacity-50" aria-hidden>
          <defs>
            <pattern id="medipal-route-grid" width="72" height="72" patternUnits="userSpaceOnUse">
              <path
                d="M72 0 L0 0 0 72"
                fill="none"
                stroke="rgba(11,95,165,0.10)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#medipal-route-grid)" />
        </svg>

        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-white via-white/70 to-transparent" />
      </div>
    );
  }

  if (variant === "ai") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#FAFCFE]">
        <svg className="absolute inset-0 h-full w-full opacity-70" aria-hidden>
          <defs>
            <pattern id="medipal-hex" width="58" height="50" patternUnits="userSpaceOnUse">
              <path
                d="M29 1 L57 17 L57 33 L29 49 L1 33 L1 17 Z"
                fill="none"
                stroke="rgba(11,95,165,0.1)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#medipal-hex)" />
        </svg>

        <div className="absolute -left-32 top-[-14rem] h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(circle,rgba(46,134,222,0.16),transparent_66%)] blur-2xl motion-safe:animate-drift-glow" />
        <div className="absolute -right-40 top-24 h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(14,154,167,0.14),transparent_68%)] blur-2xl motion-safe:animate-drift-glow [animation-delay:-6s]" />
        <div className="absolute bottom-[-18rem] left-1/3 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.95),transparent_70%)] blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(255,255,255,0.3)_45%,rgba(250,252,254,0.9))]" />
      </div>
    );
  }

  /* Blood Bank — clinical and calm: cool wash with an aqua lift. */
  return (
    <div aria-hidden className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-blush-soft")}>
      <div className="absolute inset-0 bg-[radial-gradient(125%_85%_at_50%_-15%,rgba(11,95,165,0.13),transparent_58%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_88%_8%,rgba(227,238,249,0.85),transparent_62%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_6%_82%,rgba(228,246,248,0.7),transparent_60%)]" />

      <div className="absolute -left-40 top-[-12rem] h-[44rem] w-[44rem] rounded-full bg-[radial-gradient(circle,rgba(46,134,222,0.15),transparent_65%)] blur-3xl motion-safe:animate-drift-glow" />
      <div className="absolute -right-52 top-1/4 h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle,rgba(14,154,167,0.12),transparent_66%)] blur-3xl motion-safe:animate-drift-glow [animation-delay:-8s]" />

      <svg className="absolute inset-0 h-full w-full opacity-60" aria-hidden>
        <defs>
          <pattern id="medipal-hex-soft" width="58" height="50" patternUnits="userSpaceOnUse">
            <path
              d="M29 1 L57 17 L57 33 L29 49 L1 33 L1 17 Z"
              fill="none"
              stroke="rgba(11,95,165,0.09)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#medipal-hex-soft)" />
      </svg>

      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-white via-white/70 to-transparent" />
    </div>
  );
}
