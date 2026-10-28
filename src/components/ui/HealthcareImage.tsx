import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

type HealthcareImageProps = {
  src: string;
  /** Always required — the image carries meaning, so it must describe itself. */
  alt: string;
  /** Tailwind aspect-ratio utility, e.g. `aspect-[4/3]`. Keeps every image on the page the same shape. */
  ratioClassName?: string;
  className?: string;
  /** Set `eager` only for the hero image. */
  loading?: "lazy" | "eager";
  /** Optional short note rendered under the image (e.g. an asset credit). */
  caption?: string;
  /** Drop the outer rounding and side borders — used when the image sits flush inside a card. */
  flush?: boolean;
};

/**
 * A photograph with a reserved box, a loading state and an honest fallback.
 *
 * Two rules it enforces platform-wide:
 *   1. The frame is sized before the file arrives, so a slow or failed image
 *      never shifts the layout underneath it.
 *   2. If the image cannot load, the box explains that in words instead of
 *      showing a broken-image icon — the page stays readable and truthful.
 */
export function HealthcareImage({
  src,
  alt,
  ratioClassName = "aspect-[4/3]",
  className,
  loading = "lazy",
  caption,
  flush = false,
}: HealthcareImageProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  return (
    <figure className={cn("space-y-2", className)}>
      <div
        className={cn(
          "relative w-full overflow-hidden bg-canvas-alt",
          flush ? "rounded-none border-b border-line" : "rounded-2xl border border-line",
          ratioClassName,
        )}
      >
        {status !== "error" && (
          <img
            src={src}
            alt={alt}
            loading={loading}
            decoding="async"
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-300",
              status === "ready" ? "opacity-100" : "opacity-0",
            )}
          />
        )}

        {status === "loading" && (
          <div className="absolute inset-0 animate-pulse bg-canvas-alt" aria-hidden />
        )}

        {status === "error" && (
          <div
            role="img"
            aria-label={alt}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas-alt px-4 text-center"
          >
            <ImageOff className="h-6 w-6 text-content-secondary/70" aria-hidden />
            <p className="text-xs font-medium text-content-secondary">
              This image could not be loaded.
            </p>
          </div>
        )}
      </div>

      {caption && <figcaption className="text-xs text-content-secondary">{caption}</figcaption>}
    </figure>
  );
}
