import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { EASE_SMOOTH } from "@/lib/animations";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Seconds of delay before the reveal starts. */
  delay?: number;
  /** Vertical travel distance in pixels. */
  y?: number;
  /** Only animate the first time the element enters the viewport. */
  once?: boolean;
};

/** Scroll-triggered reveal wrapper that respects prefers-reduced-motion. */
export function Reveal({ children, className, delay = 0, y = 24, once = true }: RevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.2 }}
      transition={{ duration: 0.7, delay, ease: EASE_SMOOTH }}
    >
      {children}
    </motion.div>
  );
}
