import type { Variants } from "framer-motion";

export const EASE_SMOOTH: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, ease: EASE_SMOOTH },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.8, ease: EASE_SMOOTH } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE_SMOOTH } },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.085, delayChildren: 0.06 },
  },
};

export const staggerFast: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05 },
  },
};
