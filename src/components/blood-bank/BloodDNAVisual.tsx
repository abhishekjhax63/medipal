import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { isTouchOnlyDevice, prefersReducedMotion } from "@/lib/motion";
import { useElementPointer } from "@/hooks/usePointer";
import { cn } from "@/lib/cn";

const BloodDnaScene = lazy(() => import("@/components/blood-bank/BloodDnaScene"));

type SupportState = "checking" | "webgl" | "fallback";

type BloodDNAVisualProps = {
  className?: string;
  /** Container height classes; defaults to a responsive, non-jumping stage. */
  heightClassName?: string;
};

type FallbackHelix = {
  width: number;
  height: number;
  strands: { d: string; dots: { x: number; y: number; r: number; o: number; tone: "red" | "silver" }[] }[];
  rungs: { x1: number; y1: number; x2: number; y2: number; front: boolean }[];
};

/** Local procedural helix used by the non-WebGL / reduced-motion fallback. */
function buildFallbackHelix(): FallbackHelix {
  const width = 320;
  const height = 420;
  const mid = width / 2;
  const amp = 76;
  const beadCount = 20;

  const strand = (phase: number) => {
    const segments: string[] = [];
    const dots: FallbackHelix["strands"][number]["dots"] = [];

    for (let i = 0; i <= beadCount; i += 1) {
      const t = i / beadCount;
      const y = 44 + t * (height - 88);
      const theta = t * Math.PI * 2.4 + phase;
      const x = mid + Math.sin(theta) * amp;
      const depth = Math.cos(theta); // -1 behind, +1 in front

      segments.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
      dots.push({
        x,
        y,
        r: 4.4 + depth * 2.4,
        o: 0.4 + ((depth + 1) / 2) * 0.5,
        tone: i % 3 === 0 ? "red" : "silver",
      });
    }

    return { d: segments.join(" "), dots };
  };

  const strands = [strand(0), strand(Math.PI)];
  const rungs = strands[0].dots.map((dot, i) => ({
    x1: dot.x,
    y1: dot.y,
    x2: strands[1].dots[i].x,
    y2: strands[1].dots[i].y,
    front: dot.r > 4.4 || strands[1].dots[i].r > 4.4,
  }));

  return { width, height, strands, rungs };
}

/** CSS/SVG glass DNA used when WebGL is unavailable or motion is reduced. */
function GlassDnaFallback({ interactive }: { interactive: boolean }) {
  const { ref, pointer } = useElementPointer<HTMLDivElement>();
  const innerRef = useRef<HTMLDivElement>(null);
  const helix = useMemo(buildFallbackHelix, []);

  useEffect(() => {
    if (!interactive) return;
    const node = innerRef.current;
    if (!node) return;

    let frame = 0;
    let rx = 0;
    let rz = 0;
    let tx = 0;
    let ty = 0;
    let applied = "";

    const loop = () => {
      const sample = pointer.current;
      const active = sample.active ? 1 : 0;
      rx += (-sample.ny * 11 * active - rx) * 0.075;
      rz += (sample.nx * 9 * active - rz) * 0.075;
      tx += (-sample.nx * 16 * active - tx) * 0.075;
      ty += (sample.ny * 11 * active - ty) * 0.075;

      const next = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateZ(${rz.toFixed(
        2,
      )}deg) translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;

      if (next !== applied) {
        applied = next;
        node.style.transform = next;
      }

      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [interactive, pointer]);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      <div ref={innerRef} className="h-full w-full will-change-transform">
        <svg
          viewBox={`0 0 ${helix.width} ${helix.height}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <defs>
            <radialGradient id="bb-fallback-glow" cx="50%" cy="46%" r="58%">
              <stop offset="0%" stopColor="rgba(46,134,222,0.32)" />
              <stop offset="60%" stopColor="rgba(10,61,117,0.14)" />
              <stop offset="100%" stopColor="rgba(8,9,13,0)" />
            </radialGradient>
            <linearGradient id="bb-fallback-strand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(11,27,43,0.12)" />
              <stop offset="50%" stopColor="rgba(11,27,43,0.38)" />
              <stop offset="100%" stopColor="rgba(11,27,43,0.1)" />
            </linearGradient>
            <radialGradient id="bb-fallback-bead-red" cx="34%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#CFE4FF" />
              <stop offset="42%" stopColor="#2E86DE" />
              <stop offset="100%" stopColor="#0A3D75" />
            </radialGradient>
            <radialGradient id="bb-fallback-bead-silver" cx="32%" cy="26%" r="74%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="50%" stopColor="#D9DCE5" />
              <stop offset="100%" stopColor="#8A8F9C" />
            </radialGradient>
          </defs>

          <ellipse cx={helix.width / 2} cy={helix.height / 2} rx={150} ry={186} fill="url(#bb-fallback-glow)" />

          {helix.rungs.map((rung, i) => (
            <line
              key={`rung-${i}`}
              x1={rung.x1}
              y1={rung.y1}
              x2={rung.x2}
              y2={rung.y2}
              stroke={rung.front ? "rgba(11,95,165,0.42)" : "rgba(11,27,43,0.14)"}
              strokeWidth={rung.front ? 1.6 : 1.1}
              strokeLinecap="round"
            />
          ))}

          {helix.strands.map((strand, si) => (
            <path
              key={`strand-${si}`}
              d={strand.d}
              fill="none"
              stroke="url(#bb-fallback-strand)"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {helix.strands.flatMap((strand, si) =>
            strand.dots.map((dot, i) => (
              <g key={`bead-${si}-${i}`} opacity={dot.o}>
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.r}
                  fill={dot.tone === "red" ? "url(#bb-fallback-bead-red)" : "url(#bb-fallback-bead-silver)"}
                />
                <circle cx={dot.x - dot.r * 0.3} cy={dot.y - dot.r * 0.34} r={dot.r * 0.3} fill="rgba(255,255,255,0.72)" />
              </g>
            )),
          )}
        </svg>
      </div>
    </div>
  );
}

/** Lightweight glass placeholder shown while the WebGL scene loads. */
function DnaPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="relative h-[70%] w-[46%] max-w-[240px] animate-pulse rounded-[3rem] border border-line bg-white/70">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-crimson-bright/60 to-transparent" />
        <div className="absolute inset-0 overflow-hidden rounded-[3rem]">
          <div className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/12 to-transparent animate-sheen-sweep" />
        </div>
      </div>
    </div>
  );
}

/**
 * Focal DNA centrepiece for the Blood Bank hero.
 * - Real WebGL double-helix, lazy-loaded so the route paints instantly.
 * - Honours reduced motion and WebGL support by swapping to a static/pointer-
 *   reactive glass SVG fallback (no fake imagery, pure CSS/SVG geometry).
 */
export function BloodDNAVisual({
  className,
  heightClassName = "h-[360px] sm:h-[460px] lg:h-[560px]",
}: BloodDNAVisualProps) {
  const [support, setSupport] = useState<SupportState>("checking");
  const [reduced, setReduced] = useState(false);
  const [touchOnly, setTouchOnly] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    setReduced(reduce);
    setTouchOnly(isTouchOnlyDevice());

    const media = window.matchMedia("(max-width: 640px)");
    setCompact(media.matches);
    const onCompactChange = (event: MediaQueryListEvent) => setCompact(event.matches);
    media.addEventListener("change", onCompactChange);

    let hasWebgl = false;
    try {
      const canvas = document.createElement("canvas");
      hasWebgl = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      hasWebgl = false;
    }
    setSupport(hasWebgl ? "webgl" : "fallback");

    return () => media.removeEventListener("change", onCompactChange);
  }, []);

  const showScene = support === "webgl" && !reduced;
  const interactive = !touchOnly && !reduced;

  return (
    <div className={cn("relative w-full select-none", className)}>
      {/* Illuminated base / reflection beneath the object */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 bottom-2 h-28 rounded-[50%] bg-[radial-gradient(closest-side,rgba(10,61,117,0.34),transparent_74%)] blur-2xl animate-drift-glow"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(46,134,222,0.16),transparent_72%)] blur-2xl"
      />

      {/* Canvas / fallback stage — decorative, so hidden from assistive tech */}
      <div
        aria-hidden
        className={cn(
          "relative mx-auto w-full overflow-visible transition-opacity duration-700 ease-smooth",
          heightClassName,
          support === "checking" && "opacity-70",
        )}
      >
        {showScene ? (
          <Suspense fallback={<DnaPlaceholder />}>
            <BloodDnaScene compact={compact} />
          </Suspense>
        ) : support === "checking" ? (
          <DnaPlaceholder />
        ) : (
          <GlassDnaFallback interactive={interactive} />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[0.68rem] font-medium uppercase tracking-[0.2em] text-content-secondary">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-crimson-bright shadow-glow-red-sm" />
          Donor strand
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-content-secondary/50" />
          Base pairs
        </span>
        {interactive && <span className="text-content-secondary/80">Interactive — move your pointer</span>}
      </div>
    </div>
  );
}
