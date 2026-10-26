import { useEffect, useRef } from "react";
import { isTouchOnlyDevice, prefersReducedMotion } from "@/lib/motion";

export type PointerSample = {
  /** Pointer position in element space, in pixels. */
  x: number;
  y: number;
  /** Pointer position normalised to -1..1 relative to the element centre. */
  nx: number;
  ny: number;
  /** True while the pointer is inside the element. */
  active: boolean;
};

const IDLE: PointerSample = { x: 0, y: 0, nx: 0, ny: 0, active: false };

/**
 * Tracks the pointer inside a single element using refs only — no React state,
 * so moving the mouse never triggers a re-render.
 *
 * Disabled on touch-only devices and when the user prefers reduced motion.
 */
export function useElementPointer<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const pointer = useRef<PointerSample>({ ...IDLE });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (prefersReducedMotion() || isTouchOnlyDevice()) return;

    let frame = 0;

    const measure = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      pointer.current = {
        x,
        y,
        nx: (x / rect.width) * 2 - 1,
        ny: (y / rect.height) * 2 - 1,
        active: true,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const { clientX, clientY } = event;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure(clientX, clientY);
      });
    };

    const onPointerLeave = () => {
      pointer.current = { ...pointer.current, nx: 0, ny: 0, active: false };
    };

    element.addEventListener("pointermove", onPointerMove, { passive: true });
    element.addEventListener("pointerleave", onPointerLeave, { passive: true });
    element.addEventListener("pointercancel", onPointerLeave, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerleave", onPointerLeave);
      element.removeEventListener("pointercancel", onPointerLeave);
    };
  }, []);

  return { ref, pointer };
}

/**
 * Window-level pointer position normalised to -1..1 across the viewport.
 * Intended for WebGL scenes that need a global parallax/tilt signal.
 */
export function useViewportPointer() {
  const pointer = useRef<PointerSample>({ ...IDLE });

  useEffect(() => {
    if (prefersReducedMotion() || isTouchOnlyDevice()) return;

    let frame = 0;
    let pendingX = 0;
    let pendingY = 0;

    const apply = () => {
      frame = 0;
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      pointer.current = {
        x: pendingX,
        y: pendingY,
        nx: (pendingX / width) * 2 - 1,
        ny: (pendingY / height) * 2 - 1,
        active: true,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      pendingX = event.clientX;
      pendingY = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    const onPointerLeave = () => {
      pointer.current = { ...pointer.current, nx: 0, ny: 0, active: false };
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerout", onPointerLeave, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerLeave);
    };
  }, []);

  return pointer;
}

/** Convenience: latest pointer sample without subscribing to re-renders. */
export function usePointerValue<T extends HTMLElement = HTMLDivElement>() {
  return useElementPointer<T>();
}
