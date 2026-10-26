import { useEffect, useRef, type HTMLAttributes, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";

export type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  /** Track the pointer and move the internal reflection (desktop pointers only). */
  interactive?: boolean;
  /** Draw the illuminated crimson hairline along the top edge. */
  hairline?: boolean;
  /** Glass density: `dark` uses the standard panel, `light` the airier one. */
  tone?: "dark" | "light";
  /** Depth feedback on hover. */
  lift?: boolean;
};

/**
 * Layered glass surface with a pointer-tracked reflection.
 * Reflection position is written straight to CSS custom properties via refs,
 * so pointer movement never causes a React re-render.
 */
export function GlassCard({
  className,
  interactive = true,
  hairline = false,
  tone = "dark",
  lift = true,
  children,
  onPointerMove,
  onPointerLeave,
  ...rest
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const frame = useRef(0);

  useEffect(
    () => () => {
      if (frame.current) window.cancelAnimationFrame(frame.current);
    },
    [],
  );

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (interactive && element) {
      const { clientX, clientY } = event;
      if (!frame.current) {
        frame.current = window.requestAnimationFrame(() => {
          frame.current = 0;
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const x = clientX - rect.left;
          const y = clientY - rect.top;
          element.style.setProperty("--mx", `${x}px`);
          element.style.setProperty("--my", `${y}px`);
          element.style.setProperty("--tilt-x", `${((x / rect.width) * 2 - 1).toFixed(3)}`);
          element.style.setProperty("--tilt-y", `${((y / rect.height) * 2 - 1).toFixed(3)}`);
        });
      }
    }
    onPointerMove?.(event);
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (element) {
      element.style.setProperty("--tilt-x", "0");
      element.style.setProperty("--tilt-y", "0");
    }
    onPointerLeave?.(event);
  };

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn(
        tone === "dark" ? "glass-panel" : "glass-light",
        "glass-sheen relative overflow-hidden rounded-3xl transition-[transform,box-shadow,border-color] duration-500 ease-smooth will-change-transform",
        hairline && "glass-hairline",
        lift && "hover:-translate-y-1.5",
        interactive && "hover:border-crimson/25",
        lift && "hover:shadow-glass-lift",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
