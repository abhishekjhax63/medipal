import { CircleAlert, Clock, Info, LoaderCircle, Mail, Phone, Send } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";

/** Deliberately simple, permissive email shape check (no RFC parsing). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MIN_NAME_LENGTH = 2;
const MIN_SUBJECT_LENGTH = 4;
const MIN_MESSAGE_LENGTH = 20;

const contactMethods = [
  {
    id: "phone",
    label: "Phone",
    value: "7061241812",
    href: "tel:7061241812",
    icon: Phone,
    hint: "Opens your phone app on supported devices.",
  },
  {
    id: "email",
    label: "Email",
    value: "flex8india@gmail.com",
    href: "mailto:flex8india@gmail.com",
    icon: Mail,
    hint: "Opens your email client with a blank message.",
  },
] as const;

type ContactErrors = {
  fullName?: string;
  email?: string;
  subject?: string;
  message?: string;
};

/** Contact content for the `/contact` route: real contact details plus a demonstration form. */
export function ContactSection() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  const timerRef = useRef<number | null>(null);
  const fullNameId = useId();
  const fullNameErrorId = useId();
  const emailId = useId();
  const emailErrorId = useId();
  const subjectId = useId();
  const subjectErrorId = useId();
  const messageId = useId();
  const messageErrorId = useId();

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: ContactErrors = {};

    if (fullName.trim().length < MIN_NAME_LENGTH) {
      nextErrors.fullName = "Please enter your full name.";
    }
    if (!email.trim()) {
      nextErrors.email = "Please enter your email address.";
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = "Enter a valid email address, for example name@example.com.";
    }
    if (subject.trim().length < MIN_SUBJECT_LENGTH) {
      nextErrors.subject = `Please add a subject of at least ${MIN_SUBJECT_LENGTH} characters.`;
    }
    if (message.trim().length < MIN_MESSAGE_LENGTH) {
      nextErrors.message = `Please write at least ${MIN_MESSAGE_LENGTH} characters so we can understand your message.`;
    }

    setErrors(nextErrors);
    if (nextErrors.fullName || nextErrors.email || nextErrors.subject || nextErrors.message) {
      setStatus("idle");
      return;
    }

    setStatus("submitting");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setStatus("done");
      setFullName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setErrors({});
    }, 900);
  };

  return (
    <section aria-labelledby="contact-heading" className="section-pad relative pt-12 sm:pt-16">
      <div className="section-shell relative">
        <SectionHeading
          id="contact-heading"
          eyebrow="CONTACT"
          title={
            <>
              Get in touch with <span className="text-gradient-red">MEDIPAL</span>.
            </>
          }
          description="Reach the team using the details below, or send a demonstration message with the form. The form validates your input in the browser and is not connected to a backend."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-5">
            {contactMethods.map((method, index) => {
              const Icon = method.icon;
              return (
                <Reveal key={method.id} delay={index * 0.06}>
                  <GlassCard interactive hairline className="p-0">
                    <a
                      href={method.href}
                      className="flex items-center gap-4 rounded-3xl p-5 transition-colors duration-300"
                    >
                      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-[linear-gradient(140deg,rgba(255,231,237,0.9),rgba(255,255,255,0.9))] shadow-[0_12px_30px_-18px_rgba(233,30,77,0.55),inset_0_1px_0_rgba(255,255,255,0.95)]">
                        <Icon className="h-5 w-5 text-crimson" aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-manrope text-[0.62rem] uppercase tracking-[0.24em] text-content-secondary">
                          {method.label}
                        </span>
                        <span className="truncate font-display text-base text-content-primary">
                          {method.value}
                        </span>
                        <span className="mt-0.5 text-xs text-content-secondary/80">
                          {method.hint}
                        </span>
                      </span>
                    </a>
                  </GlassCard>
                </Reveal>
              );
            })}

            <Reveal delay={0.12}>
              <div className="glass-panel-soft glass-hairline relative overflow-hidden rounded-4xl p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-crimson-bright" aria-hidden />
                  <p className="text-sm leading-relaxed text-content-secondary">
                    Replies are typically handled during business hours. This build does not send
                    messages to a live backend, so nothing is transmitted from this page.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="glass-panel-soft glass-hairline relative overflow-hidden rounded-4xl p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-crimson-bright" aria-hidden />
                  <div>
                    <h2 className="font-display text-sm font-semibold text-content-primary">
                      What happens with my details?
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-content-secondary">
                      Nothing you type here is stored or transmitted in this build — there is no
                      backend attached. In a future release, a secure server-side endpoint would
                      process your message under the platform&apos;s privacy policy, and you would be
                      told exactly how your details are used.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="glass-panel glass-hairline relative h-full overflow-hidden rounded-4xl p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold text-content-primary">
                Send a demonstration message
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-content-secondary">
                All fields are required. Your input is validated in the browser only.
              </p>

              <form onSubmit={handleSubmit} noValidate className="mt-6 grid gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor={fullNameId} className="field-label">
                      Full name
                    </label>
                    <input
                      id={fullNameId}
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => {
                        setFullName(event.target.value);
                        if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
                      }}
                      aria-invalid={Boolean(errors.fullName)}
                      aria-describedby={errors.fullName ? fullNameErrorId : undefined}
                      placeholder="Your full name"
                      disabled={status === "submitting"}
                      className="field"
                    />
                    {errors.fullName && (
                      <p id={fullNameErrorId} className="field-error">
                        <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {errors.fullName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor={emailId} className="field-label">
                      Email
                    </label>
                    <input
                      id={emailId}
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                      }}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? emailErrorId : undefined}
                      placeholder="name@example.com"
                      disabled={status === "submitting"}
                      className="field"
                    />
                    {errors.email && (
                      <p id={emailErrorId} className="field-error">
                        <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {errors.email}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor={subjectId} className="field-label">
                    Subject
                  </label>
                  <input
                    id={subjectId}
                    name="subject"
                    type="text"
                    value={subject}
                    onChange={(event) => {
                      setSubject(event.target.value);
                      if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
                    }}
                    aria-invalid={Boolean(errors.subject)}
                    aria-describedby={errors.subject ? subjectErrorId : undefined}
                    placeholder="What is this about?"
                    disabled={status === "submitting"}
                    className="field"
                  />
                  {errors.subject && (
                    <p id={subjectErrorId} className="field-error">
                      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {errors.subject}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={messageId} className="field-label">
                    Message
                  </label>
                  <textarea
                    id={messageId}
                    name="message"
                    rows={6}
                    value={message}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
                    }}
                    aria-invalid={Boolean(errors.message)}
                    aria-describedby={errors.message ? messageErrorId : undefined}
                    placeholder={`Share the details of your message (at least ${MIN_MESSAGE_LENGTH} characters).`}
                    disabled={status === "submitting"}
                    className="field resize-y"
                  />
                  {errors.message && (
                    <p id={messageErrorId} className="field-error">
                      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {errors.message}
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
                    {status === "submitting" ? "Submitting…" : "Send message"}
                  </button>

                  <div aria-live="polite" className="sm:max-w-xs">
                    {status === "done" && (
                      <p
                        role="status"
                        className="rounded-2xl border border-crimson-bright/35 bg-crimson/10 px-4 py-3 text-xs leading-relaxed text-content-primary"
                      >
                        Demonstration only — this form is not connected to a backend, so your message
                        was not delivered.
                      </p>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
