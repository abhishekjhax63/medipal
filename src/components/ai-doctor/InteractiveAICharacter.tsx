import {
  Component,
  Suspense,
  lazy,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useElementPointer } from "@/hooks/usePointer";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { CSSCharacterFallback } from "@/components/ai-doctor/CSSCharacterFallback";

/** three.js stays out of the initial bundle — the scene is code-split. */
const LazyAIScene = lazy(() => import("@/components/ai-doctor/AIScene"));

type InteractiveAICharacterProps = {
  /** Shorter presentation used beside the conversation. */
  compact?: boolean;
  /** True while the assistant is preparing a reply — drives the activity glow. */
  thinking?: boolean;
  className?: string;
};

function detectWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ?? canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

/** Thin geometric accent echoing the hexagon pattern behind the page. */
function HexAccent({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none">
      <path
        d="M100 6 L182 53 L182 147 L100 194 L18 147 L18 53 Z"
        stroke="rgba(225,29,72,0.55)"
        strokeWidth="1"
      />
      <path
        d="M100 34 L156 66 L156 134 L100 166 L44 134 L44 66 Z"
        stroke="rgba(225,29,72,0.3)"
        strokeWidth="1"
      />
    </svg>
  );
}

type SceneBoundaryProps = { fallback: ReactNode; children: ReactNode };
type SceneBoundaryState = { failed: boolean };

/** Keeps the page alive if WebGL initialisation throws at runtime. */
class SceneErrorBoundary extends Component<SceneBoundaryProps, SceneBoundaryState> {
  state: SceneBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.warn("MEDIPAL AI character: WebGL scene failed, using the CSS fallback.", error, info.componentStack);
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Pointer-reactive MEDIPAL robot.
 *
 * The pointer is tracked on this container only (ref-based, no React state), so
 * orientation, rim colour and halo intensity are driven inside the frame loop
 * of whichever renderer is active. Touch-only devices and `prefers-reduced-motion`
 * fall back to a calm idle pose automatically.
 */
export function InteractiveAICharacter({
  compact = false,
  thinking = false,
  className,
}: InteractiveAICharacterProps) {
  const { ref, pointer } = useElementPointer<HTMLDivElement>();
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const [webglSupported] = useState(detectWebGL);

  const fallback = (
    <CSSCharacterFallback pointerRef={pointer} reducedMotion={reducedMotion} thinking={thinking} />
  );

  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)}>
      <div
        ref={ref}
        aria-hidden
        className={cn(
          "relative w-full max-w-[520px] select-none overflow-hidden",
          compact ? "h-[280px] sm:h-[320px] lg:h-[360px]" : "h-[340px] sm:h-[440px] lg:h-[520px]",
        )}
      >
        {/* Soft lighting layers.
            These are sized with `inset-*` rather than `left-1/2 … -translate-x-1/2`,
            because the keyframe animations below write their own `transform` and
            would otherwise cancel the centring translate and overflow the page. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(255,255,255,0.95),rgba(255,255,255,0)_64%)]" />
        <div className="pointer-events-none absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgba(255,49,87,0.2),transparent_70%)] blur-2xl motion-safe:animate-drift-glow" />

        {/* Thin geometric rings */}
        <div className="pointer-events-none absolute inset-[14%] rounded-full border border-crimson/15" />
        <div className="pointer-events-none absolute inset-[5%] rounded-full border border-dashed border-crimson/10 motion-safe:animate-float-y" />
        <HexAccent className="pointer-events-none absolute left-1/2 top-1/2 h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 opacity-[0.15]" />

        <div className="relative h-full w-full">
          {webglSupported ? (
            <SceneErrorBoundary fallback={fallback}>
              <Suspense fallback={fallback}>
                <LazyAIScene pointerRef={pointer} reducedMotion={reducedMotion} thinking={thinking} />
              </Suspense>
            </SceneErrorBoundary>
          ) : (
            fallback
          )}
        </div>
      </div>

      <p className="font-manrope text-[0.6rem] uppercase tracking-[0.24em] text-ink/45">
        Move your pointer — MEDIPAL follows.
      </p>
    </div>
  );
}
