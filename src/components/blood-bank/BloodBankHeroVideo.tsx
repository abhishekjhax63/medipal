import { useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Served verbatim by Vite from `public/assets/`, so the exact supplied file is
 * used and nothing is re-encoded or replaced with generated imagery.
 */
const HERO_VIDEO_SRC = "/assets/blood-bank-hero.mp4";

type BloodBankHeroVideoProps = {
  className?: string;
  src?: string;
  /** Frame container classes for sizing. */
  containerClassName?: string;
};

/**
 * Framed, looping hero video that stands in for the procedural DNA centrepiece.
 *
 * - Muted + `playsInline` so mobile browsers permit autoplay.
 * - Playback follows visibility: it starts when scrolled into view and pauses
 *   when it leaves, so it never loops off-screen.
 * - Reduced-motion visitors get a paused first frame with native controls
 *   rather than an autoplaying loop.
 * - No poster artwork is invented. The blush wash behind the video covers the
 *   loading window, and a missing file reports itself honestly.
 */
export function BloodBankHeroVideo({
  className,
  src = HERO_VIDEO_SRC,
  containerClassName = "max-w-xl lg:max-w-2xl",
}: BloodBankHeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsControls, setNeedsControls] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    // Reduced motion: never start playback on the visitor's behalf.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNeedsControls(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            element.pause();
            continue;
          }
          // A refused autoplay is not an error; revealing controls lets the
          // visitor start it deliberately.
          element.play().catch(() => setNeedsControls(true));
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn("relative w-full select-none", className)}>
      {/* Soft crimson bloom beneath the frame, echoing the old DNA stage glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 bottom-0 h-32 rounded-[50%] bg-[radial-gradient(closest-side,rgba(225,29,72,0.3),transparent_74%)] blur-2xl"
      />

      {/* Blush mat → thin white frame → video. The mat is what makes a white
          border legible on a white page instead of invisible. */}
      <figure
        className={cn(
          "relative w-full aspect-[4/3] rounded-[2.25rem] bg-[linear-gradient(140deg,#ffe7ed,#fff5f7_48%,#ffd6e2)] p-1.5",
          "shadow-[0_40px_90px_-46px_rgba(76,16,40,0.5),0_0_80px_-30px_rgba(233,30,77,0.45)]",
          containerClassName,
        )}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[1.9rem] border-[5px] border-white bg-[linear-gradient(140deg,#fff5f7,#ffffff)]">
          <video
            ref={videoRef}
            className="h-full w-full object-cover object-center"
            muted
            loop
            playsInline
            preload="metadata"
            controls={needsControls}
            onError={() => setFailed(true)}
            aria-label="Blood donation awareness video"
          >
            <source src={src} type="video/mp4" />
          </video>

          {failed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-crimson/15 bg-blush text-crimson">
                <ShieldAlert className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-content-primary">
                The hero video could not be loaded.
              </p>
              <p className="max-w-xs text-[0.78rem] leading-relaxed text-content-secondary">
                Put the file back at{" "}
                <code className="rounded bg-blush px-1.5 py-0.5 font-mono text-[0.72rem] text-crimson-soft">
                  public{src}
                </code>{" "}
                to restore it.
              </p>
            </div>
          )}
        </div>
      </figure>
    </div>
  );
}
