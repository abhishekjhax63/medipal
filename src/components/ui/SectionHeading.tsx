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
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  id,
}: SectionHeadingProps) {
  return (
    <Reveal className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && (
        <p className="eyebrow mb-4">
          <span className="mr-3 inline-block h-px w-8 translate-y-[-3px] bg-gradient-to-r from-crimson-bright to-transparent align-middle" />
          {eyebrow}
        </p>
      )}
      <h2
        id={id}
        className="font-display text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-content-primary sm:text-4xl lg:text-[2.9rem]"
      >
        {title}
      </h2>
      {description && (
        <p className="mt-5 text-base leading-relaxed text-content-secondary sm:text-[1.05rem]">
          {description}
        </p>
      )}
    </Reveal>
  );
}
