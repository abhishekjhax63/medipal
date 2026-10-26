/** Shared motion + colour constants used across DOM and WebGL code. */

export const colors = {
  red: "#E91E4D",
  redBright: "#F04452",
  redSoft: "#C2183A",
  /** Burgundy is used only for WebGL depth, contact shadows and vignettes. */
  burgundy: "#4C1028",
  blink: "#FFE7ED",
  blush: "#FFF5F7",
  ink: "#17171C",
  textSecondary: "#686873",
  line: "#E8DDE1",
  silver: "#D9DCE5",
  pearl: "#F7F8FB",
} as const;

/**
 * Frame-rate independent damping (a.k.a. exponential smoothing).
 * Returns the new value moved towards `target`.
 */
export function damp(current: number, target: number, lambda: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}

export const motionDurations = {
  fast: 0.25,
  base: 0.45,
  slow: 0.9,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isTouchOnlyDevice(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none)").matches;
}
