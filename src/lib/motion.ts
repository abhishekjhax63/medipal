/** Shared motion + colour constants used across DOM and WebGL code. */

export const colors = {
  red: "#0B5FA5",
  redBright: "#2E86DE",
  redSoft: "#0A3D75",
  /** Burgundy is used only for WebGL depth, contact shadows and vignettes. */
  burgundy: "#062A4E",
  blink: "#E3EEF9",
  blush: "#F4F8FC",
  ink: "#0B1B2B",
  textSecondary: "#55697D",
  line: "#DDE5EE",
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
