import { CircleAlert, LoaderCircle, Quote, Send, Star } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/cn";

const MIN_FEEDBACK_LENGTH = 20;
const RATING_VALUES = [1, 2, 3, 4, 5] as const;

type ReviewErrors = {
  name?: string;
  rating?: string;
  feedback?: string;
};

/** Reviews content for the `/reviews` route: an honest empty state plus a demo submission form. */
export function ReviewsSection() {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  const timerRef = useRef<number | null>(null);
  const nameId = useId();
  const nameErrorId = useId();
  const ratingErrorId = useId();
  const feedbackId = useId();
  const feedbackErrorId = useId();

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: ReviewErrors = {};
    if (!name.trim()) nextErrors.name = "Please add a name or a short label for your review.";
    if (!rating) nextErrors.rating = "Please choose a rating from 1 to 5.";
    if (feedback.trim().length < MIN_FEEDBACK_LENGTH) {
      nextErrors.feedback = `Please write at least ${MIN_FEEDBACK_LENGTH} characters of feedback.`;
    }

    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.rating || nextErrors.feedback) {
      setStatus("idle");
      return;
    }

    setStatus("submitting");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setStatus("done");
      setName("");
      setRating(0);
      setFeedback("");
      setErrors({});
    }, 900);
  };

  return (
    <section aria-labelledby="reviews-heading" className="section-pad relative pt-12 sm:pt-16">
      <div className="section-shell relative">
        <SectionHeading
          id="reviews-heading"
          eyebrow="REVIEWS"
          align="center"
          title={
            <>
              Feedback we can <span className="text-gradient-red">verify</span>.
            </>
          }
          description="MEDIPAL does not publish unverified patient testimonials, invent ratings, or present medical success stories it cannot evidence. No review has been verified yet, so this section is deliberately empty."
        />

        <Reveal className="mt-12">
          <GlassCard hairline className="mx-auto flex max-w-3xl flex-col items-center px-6 py-12 text-center sm:px-10">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-[linear-gradient(140deg,rgba(255,231,237,0.9),rgba(255,255,255,0.9))] shadow-[0_12px_30px_-18px_rgba(233,30,77,0.55),inset_0_1px_0_rgba(255,255,255,0.95)]">
              <Quote className="h-6 w-6 text-crimson" aria-hidden />
            </span>
            <h2 className="mt-5 font-display text-xl font-semibold text-content-primary">
              No verified reviews yet
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-content-secondary">
              Real, attributable reviews will appear here once a verified review source is
              integrated. Until then nothing on this page represents a real person, hospital or
              rating.
            </p>
            <p className="mt-4 text-xs leading-relaxed text-content-secondary/80">
              If you would like to share feedback now, the form below validates your input locally
              and tells you exactly what happens to it.
            </p>
          </GlassCard>
        </Reveal>

        <Reveal className="mt-10">
          <div className="glass-panel glass-hairline relative overflow-hidden rounded-4xl p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold text-content-primary">
              Share a demonstration review
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-content-secondary">
              This form validates your input locally to show how review submission will behave. It is
              not connected to a review pipeline and nothing you type is published or stored.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-6 grid gap-5">
              <div>
                <label htmlFor={nameId} className="field-label">
                  Display name
                </label>
                <input
                  id={nameId}
                  name="reviewName"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? nameErrorId : undefined}
                  placeholder="Your name or a short label"
                  disabled={status === "submitting"}
                  className="field"
                />
                {errors.name && (
                  <p id={nameErrorId} className="field-error">
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {errors.name}
                  </p>
                )}
              </div>

              <fieldset
                aria-invalid={Boolean(errors.rating)}
                aria-describedby={errors.rating ? ratingErrorId : undefined}
              >
                <legend className="field-label">Your rating</legend>
                <div className="flex flex-wrap items-center gap-2">
                  {RATING_VALUES.map((value) => {
                    const selected = rating === value;
                    return (
                      <label key={value} className="cursor-pointer">
                        <input
                          type="radio"
                          name="reviewRating"
                          value={value}
                          checked={selected}
                          onChange={() => {
                            setRating(value);
                            if (errors.rating) {
                              setErrors((prev) => ({ ...prev, rating: undefined }));
                            }
                          }}
                          disabled={status === "submitting"}
                          className="peer sr-only"
                        />
                        <span
                          className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-300 ease-smooth peer-focus-visible:ring-2 peer-focus-visible:ring-crimson/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white",
                            selected
                              ? "border-crimson/50 bg-blush shadow-[0_10px_26px_-16px_rgba(233,30,77,0.75)]"
                              : "border-line bg-white/70 hover:border-crimson/35",
                            status === "submitting" && "opacity-60",
                          )}
                        >
                          <Star
                            className={cn(
                              "h-5 w-5",
                              selected ? "fill-crimson text-crimson" : "text-content-secondary",
                            )}
                            aria-hidden
                          />
                        </span>
                        <span className="sr-only">
                          {value} star{value > 1 ? "s" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {errors.rating && (
                  <p id={ratingErrorId} className="field-error">
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {errors.rating}
                  </p>
                )}
              </fieldset>

              <div>
                <label htmlFor={feedbackId} className="field-label">
                  Your feedback
                </label>
                <textarea
                  id={feedbackId}
                  name="reviewFeedback"
                  rows={5}
                  value={feedback}
                  onChange={(event) => {
                    setFeedback(event.target.value);
                    if (errors.feedback) setErrors((prev) => ({ ...prev, feedback: undefined }));
                  }}
                  aria-invalid={Boolean(errors.feedback)}
                  aria-describedby={errors.feedback ? feedbackErrorId : undefined}
                  placeholder={`Tell us what worked or what could be clearer (at least ${MIN_FEEDBACK_LENGTH} characters).`}
                  disabled={status === "submitting"}
                  className="field resize-y"
                />
                {errors.feedback && (
                  <p id={feedbackErrorId} className="field-error">
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {errors.feedback}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="btn-primary justify-center sm:w-auto"
                >
                  {status === "submitting" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                  {status === "submitting" ? "Submitting…" : "Submit review"}
                </button>

                <div aria-live="polite" className="sm:max-w-md">
                  {status === "done" && (
                    <p
                      role="status"
                      className="rounded-2xl border border-crimson-bright/35 bg-crimson/10 px-4 py-3 text-xs leading-relaxed text-content-primary"
                    >
                      Demonstration only — your review was not published. Reviews are published only
                      after verification is available.
                    </p>
                  )}
                </div>
              </div>
            </form>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
