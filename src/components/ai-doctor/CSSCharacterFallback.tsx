import { useEffect, useRef, type RefObject } from "react";
import type { PointerSample } from "@/hooks/usePointer";
import { colors, damp } from "@/lib/motion";

type CSSCharacterFallbackProps = {
  pointerRef: RefObject<PointerSample>;
  reducedMotion: boolean;
  /** True while the assistant is preparing a reply — brightens the LED accents. */
  thinking?: boolean;
};

/**
 * Non-WebGL fallback: a layered CSS/SVG MEDIPAL character that still reacts to
 * the pointer through a ref-driven rAF loop (no React state per move). It mirrors
 * the WebGL look — a pearl-white ceramic shell with a translucent rose visor and
 * crimson LED accents.
 */
export function CSSCharacterFallback({
  pointerRef,
  reducedMotion,
  thinking = false,
}: CSSCharacterFallbackProps) {
  const shell = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const eyes = useRef<HTMLDivElement>(null);
  const eyeBlink = useRef<HTMLDivElement>(null);
  const rim = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);

  // Mirror the prop into a ref so the frame loop always reads the latest value.
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;

  useEffect(() => {
    if (reducedMotion) return;

    let frame = 0;
    let last = performance.now();
    let yaw = 0;
    let pitch = 0;
    let attention = 0;
    let blinkAt = 2.2 + Math.random() * 3.4;
    let blinkProgress = -1;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const time = now / 1000;
      const sample = pointerRef.current;
      const active = Boolean(sample?.active);
      const nx = active ? Math.max(-1, Math.min(1, sample.nx)) : 0;
      const ny = active ? Math.max(-1, Math.min(1, sample.ny)) : 0;
      const proximity = active ? Math.max(0, 1 - Math.min(1, Math.hypot(nx, ny) / 1.15)) : 0;
      const isThinking = thinkingRef.current;

      attention = damp(attention, proximity > 0.55 ? 1 : 0, 3, dt);
      yaw = damp(yaw, nx * 13, 4.5, dt);
      pitch = damp(pitch, -ny * 9, 4.5, dt);

      // A faster, brighter pulse while the assistant is preparing a reply.
      const pulseRate = isThinking ? 5.4 : 1.5;
      const pulseAmount = isThinking ? 0.06 : 0.02;
      const pulse = 1 + Math.sin(time * pulseRate) * pulseAmount * (isThinking ? 1 : attention + 0.4);

      if (shell.current) {
        shell.current.style.transform = `translate3d(${(nx * 10).toFixed(2)}px, ${(ny * 8).toFixed(2)}px, 0) rotateX(${pitch.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) scale(${(
          pulse + proximity * 0.012
        ).toFixed(3)})`;
      }
      if (face.current) {
        face.current.style.transform = `translateX(${(nx * -6).toFixed(2)}px) rotateY(${(yaw * 0.4).toFixed(2)}deg)`;
      }
      if (eyes.current) {
        eyes.current.style.transform = `translate3d(${(nx * 4).toFixed(2)}px, ${(-ny * 3).toFixed(2)}px, 0)`;
        eyes.current.style.filter = `brightness(${(1 + proximity * 0.2 + (isThinking ? 0.3 : 0)).toFixed(3)})`;
      }

      // Occasional, damped blink.
      let blinkScale = 1;
      if (blinkProgress >= 0) {
        blinkProgress += dt;
        if (blinkProgress >= 0.16) {
          blinkProgress = -1;
          blinkAt = 2.2 + Math.random() * 3.4;
        } else {
          blinkScale = 1 - Math.sin((blinkProgress / 0.16) * Math.PI) * 0.92;
        }
      } else {
        blinkAt -= dt;
        if (blinkAt <= 0) blinkProgress = 0;
      }
      if (eyeBlink.current) {
        eyeBlink.current.style.transform = `scaleY(${blinkScale.toFixed(3)})`;
      }

      if (rim.current) {
        const mix = (nx + 1) / 2;
        const colour = mix < 0.5 ? colors.redSoft : mix < 0.8 ? colors.redBright : "#FF6E93";
        const boost = isThinking ? 1.5 : 1;
        rim.current.style.borderColor = colour;
        rim.current.style.boxShadow = `0 0 ${((24 + proximity * 46) * boost).toFixed(1)}px ${((6 + proximity * 10) * boost).toFixed(
          1,
        )}px ${colour}${active ? "cc" : "66"}`;
        rim.current.style.opacity = `${(0.7 + proximity * 0.3).toFixed(3)}`;
      }
      if (halo.current) {
        const scale = 1 + proximity * 0.05 + (isThinking ? 0.03 : 0) + Math.sin(time * 2.1) * 0.012;
        halo.current.style.transform = `scale(${scale.toFixed(3)})`;
        halo.current.style.opacity = `${(0.16 + proximity * 0.42 + attention * 0.1 + (isThinking ? 0.18 : 0)).toFixed(3)}`;
      }
      if (glow.current) {
        glow.current.style.opacity = `${(0.5 + proximity * 0.4 + (isThinking ? 0.22 : 0)).toFixed(3)}`;
      }

      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [pointerRef, reducedMotion]);

  return (
    <div className="relative flex h-full w-full items-center justify-center" style={{ perspective: "900px" }}>
      <div
        ref={halo}
        className="pointer-events-none absolute h-[86%] w-[86%] rounded-full border border-crimson/25"
        style={{ opacity: 0.16 }}
      />
      <div
        ref={glow}
        className="pointer-events-none absolute h-[62%] w-[62%] rounded-full bg-[radial-gradient(circle,rgba(233,30,77,0.26),transparent_68%)] blur-2xl"
        style={{ opacity: 0.5 }}
      />

      {/* Static reduced-motion / calm affordance for AI activity. */}
      {thinking && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[56%] w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-crimson/40 motion-safe:animate-pulse-ring"
          aria-hidden
        />
      )}

      <div ref={shell} className="relative h-[68%] w-[54%] max-w-[260px] will-change-transform">
        {/* Luminous crimson rim */}
        <div
          ref={rim}
          className="pointer-events-none absolute inset-0 rounded-[46%_46%_42%_42%/52%_52%_46%_46%] border-2"
          style={{ borderColor: colors.redBright }}
        />

        {/* Pearl-white ceramic shell */}
        <div className="absolute inset-0 overflow-hidden rounded-[46%_46%_42%_42%/52%_52%_46%_46%] bg-[linear-gradient(150deg,#FFFFFF_0%,#F7F8FB_44%,#EFE1E7_100%)] shadow-[0_30px_60px_-28px_rgba(76,16,40,0.4),inset_0_2px_6px_rgba(255,255,255,0.98),inset_0_-14px_28px_-16px_rgba(233,30,77,0.16)]">
          <div className="absolute -left-6 -top-8 h-2/3 w-2/3 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.98),transparent_66%)]" />
          <div className="absolute -right-10 bottom-2 h-1/2 w-1/2 rounded-full bg-[radial-gradient(circle,rgba(233,30,77,0.16),transparent_68%)]" />
        </div>

        {/* Translucent rose glass visor */}
        <div
          ref={face}
          className="absolute left-1/2 top-[16%] h-[40%] w-[74%] -translate-x-1/2 overflow-hidden rounded-[30%] border border-crimson/25 bg-[linear-gradient(150deg,rgba(255,255,255,0.94)_0%,rgba(255,231,237,0.72)_48%,rgba(233,30,77,0.22)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_12px_28px_-20px_rgba(233,30,77,0.6)] backdrop-blur-sm"
        >
          <div className="absolute -left-8 top-0 h-full w-14 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)]" />
          <div className="absolute right-3 top-2 h-6 w-6 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.9),transparent_70%)]" />
        </div>

        {/* Crimson LED eyes */}
        <div ref={eyes} className="absolute left-1/2 top-[30%] -translate-x-1/2">
          <div ref={eyeBlink} className="flex items-center gap-3" style={{ transformOrigin: "center" }}>
            <span className="h-3 w-3 rounded-full bg-crimson-bright shadow-[0_0_14px_4px_rgba(233,30,77,0.7)]" />
            <span className="h-3 w-3 rounded-full bg-crimson-bright shadow-[0_0_14px_4px_rgba(233,30,77,0.7)]" />
          </div>
        </div>

        {/* Small visor / mouth line */}
        <div className="absolute left-1/2 top-[44%] h-[2px] w-[16%] -translate-x-1/2 rounded-full bg-crimson/40" />

        {/* Chest core LED */}
        <div className="absolute bottom-[18%] left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-crimson-bright shadow-[0_0_14px_3px_rgba(233,30,77,0.6)]" />

        {/* Antenna */}
        <div className="absolute -top-6 left-1/2 h-6 w-[2px] -translate-x-1/2 bg-[#D9DCE5]" />
        <div className="absolute -top-8 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-crimson-bright shadow-[0_0_14px_4px_rgba(233,30,77,0.7)]" />
      </div>
    </div>
  );
}
