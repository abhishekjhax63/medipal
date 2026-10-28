import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

type SectionHeadingProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
  id?: string;
  /** Heading level. Defaults to `h2`; use `h1` when this is the page's main heading. */
  as?: "h1" | "h2";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  id,
  as: Heading = "h2",
}: SectionHeadingProps) {
  return (
    <Reveal className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && (
        <p className="eyebrow mb-4">
          <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-gradient-to-r from-brand to-transparent align-middle" />
          {eyebrow}
        </p>
      )}
      <Heading
        id={id}
        className="font-display text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-content-primary sm:text-4xl lg:text-[2.9rem]"
      >
        {title}
      </Heading>
      {description && (
        <p className="mt-5 text-base leading-relaxed text-content-secondary sm:text-[1.05rem]">
          {description}
        </p>
      )}
    </Reveal>
  );
}
