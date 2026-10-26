import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
  Phone,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MedipalLogo } from "@/components/ui/MedipalLogo";
import { EASE_SMOOTH } from "@/lib/animations";

/** Deliberately simple, permissive email shape check (no RFC parsing). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MIN_PASSWORD_LENGTH = 8;
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

const COUNTRY_CODES = [
  { code: "+91", label: "India +91" },
  { code: "+880", label: "Bangladesh +880" },
  { code: "+977", label: "Nepal +977" },
  { code: "+971", label: "UAE +971" },
  { code: "+44", label: "United Kingdom +44" },
  { code: "+1", label: "United States +1" },
] as const;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * The one honest statement used by every provider path. No provider is
 * connected in this build, so nothing here may claim a session was created.
 */
const DEMO_NOTICE =
  "Demonstration only — authentication is not connected in this build, so no account has been created and you are not signed in.";

const GOOGLE_NOTICE =
  "Demonstration only — Google sign-in is not configured for this build, so no Google account was contacted and no sign-in occurred.";

const OTP_NOTICE =
  "Demonstration only — no SMS gateway is connected, so no verification code was actually sent to this number.";

type AuthMode = "chooser" | "phone" | "email";
type EmailMode = "signin" | "create" | "forgot";
type PendingAction = "google" | "phone" | "email" | null;

/** Google "G" glyph drawn inline so the modal ships without external images. */
function GoogleGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
      className="shrink-0"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

/**
 * Sign-in surface with the three entry points the product needs: Google,
 * phone number with a verification-code screen, and email with password.
 *
 * Every path is intentionally presentational. No OAuth redirect, no SMS
 * gateway and no session exist in this build, so each flow performs real
 * client-side validation and then states plainly that nothing happened.
 * A future integration would replace the `runDemo` call in the matching
 * handler with the real provider request, leaving this layout untouched.
 *
 * Passwords live only in component state for the lifetime of the modal: they
 * are never persisted, never logged and never transmitted.
 */
export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<AuthMode>("chooser");
  const [emailMode, setEmailMode] = useState<EmailMode>("signin");
  const [phonePhase, setPhonePhase] = useState<"enter" | "otp">("enter");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [countryCode, setCountryCode] = useState<string>("+91");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  const [fieldError, setFieldError] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const otpRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const titleId = useId();
  const descriptionId = useId();
  const emailInputId = useId();
  const passwordInputId = useId();
  const phoneInputId = useId();
  const otpInputId = useId();
  const errorId = useId();

  const resetAll = () => {
    setMode("chooser");
    setEmailMode("signin");
    setPhonePhase("enter");
    setNotice("");
    setPending(null);
    setEmail("");
    setPassword("");
    setPasswordVisible(false);
    setCountryCode("+91");
    setPhone("");
    setOtp("");
    setFieldError("");
    setResendSeconds(0);
  };

  // Fresh state every time the modal opens.
  useEffect(() => {
    if (!open) return;
    resetAll();
  }, [open]);

  // Clean up any pending demo timer on unmount.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  // Focus in on open, restore on close, lock scroll, Escape to close, trap tab.
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const autofocusTarget = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    autofocusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.repeat) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open, onClose]);

  // Move focus to the field each step reveals.
  useEffect(() => {
    if (!open) return;
    if (mode === "email") emailRef.current?.focus();
    if (mode === "phone" && phonePhase === "enter") phoneRef.current?.focus();
    if (mode === "phone" && phonePhase === "otp") otpRef.current?.focus();
  }, [open, mode, phonePhase]);

  // Resend countdown, active only while the code screen is showing.
  useEffect(() => {
    if (!open || mode !== "phone" || phonePhase !== "otp") return;
    const id = window.setInterval(() => {
      setResendSeconds((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, mode, phonePhase]);

  /** Shared demonstration delay: a real request would live here instead. */
  const runDemo = (action: Exclude<PendingAction, null>, message: string) => {
    setNotice("");
    setFieldError("");
    setPending(action);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPending(null);
      setNotice(message);
    }, 900);
  };

  const goToMode = (next: AuthMode) => {
    setMode(next);
    setNotice("");
    setFieldError("");
    setPhonePhase("enter");
    setOtp("");
    if (next !== "phone") setResendSeconds(0);
  };

  /* ---------------------------- Google ---------------------------- */

  const handleGoogle = () => {
    // Future integration point: replace with the real OAuth starter, e.g.
    // `await signInWithOAuth("google")` before redirecting to the provider.
    // Until then we say plainly that nothing happened.
    runDemo("google", GOOGLE_NOTICE);
  };

  /* ----------------------------- Phone ---------------------------- */

  const normalisedPhone = () =>
    `${countryCode}${phone.replace(/[\s()-]/g, "").replace(/^0+/, "")}`;

  const handleSendOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (!digits) {
      setFieldError("Enter the mobile number you would like to use.");
      return;
    }
    if (digits.length < 6 || digits.length > 15) {
      setFieldError("Enter a valid mobile number, for example 9876543210.");
      return;
    }
    setFieldError("");
    setNotice("");
    setPending("phone");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPending(null);
      setPhonePhase("otp");
      setResendSeconds(RESEND_SECONDS);
      setNotice(OTP_NOTICE);
    }, 900);
  };

  const handleVerifyOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const digits = otp.replace(/\D/g, "");
    if (!digits) {
      setFieldError("Enter the verification code.");
      return;
    }
    if (digits.length !== OTP_LENGTH) {
      setFieldError(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    // A real gateway response would be verified server-side here. Without one,
    // we must not report a successful verification.
    runDemo("email", DEMO_NOTICE);
  };

  const handleResend = () => {
    setFieldError("");
    setOtp("");
    setResendSeconds(RESEND_SECONDS);
    setNotice(OTP_NOTICE);
  };

  /* ------------------------------ Email --------------------------- */

  const handleEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError("Enter the email address you would like to use.");
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setFieldError("Enter a valid email address, for example name@example.com.");
      return;
    }
    if (emailMode !== "forgot") {
      if (!password) {
        setFieldError("Enter your password.");
        return;
      }
      if (emailMode === "create" && password.length < MIN_PASSWORD_LENGTH) {
        setFieldError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
        return;
      }
    }
    setFieldError("");
    // Future integration point: hand the credentials to the real auth provider
    // instead of the demo timer.
    runDemo("email", DEMO_NOTICE);
  };

  const emailCopy = {
    signin: { title: "Sign in with email", submit: "Sign In", icon: Mail },
    create: { title: "Create your account", submit: "Create Account", icon: UserPlus },
    forgot: { title: "Reset your password", submit: "Send reset link", icon: Mail },
  }[emailMode];

  const SubmitIcon = emailCopy.icon;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="medipal-login-scrim"
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/45 backdrop-blur-md sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: EASE_SMOOTH }}
          onClick={onClose}
        >
          <motion.div
            key="medipal-login-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 48, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.34, ease: EASE_SMOOTH }}
            className="glass-panel relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-4xl px-6 pb-7 pt-6 outline-none sm:max-h-[88vh] sm:rounded-4xl"
          >
            <div className="flex items-start justify-between gap-4">
              <MedipalLogo size={40} withWordmark />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sign in"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white/70 text-content-secondary transition-colors duration-300 hover:bg-blush hover:text-content-primary"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {mode === "chooser" ? (
              <>
                <h2
                  id={titleId}
                  data-autofocus
                  tabIndex={-1}
                  className="mt-6 font-display text-2xl font-semibold tracking-[-0.01em] text-content-primary outline-none"
                >
                  Welcome to MEDIPAL
                </h2>
                <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-content-secondary">
                  One sign-in for Blood Bank, AI Doctor and E-UPCHAR. Choose how you would like to
                  continue.
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => goToMode("chooser")}
                  className="btn-ghost mt-5 self-start px-0 py-1 text-xs"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                  All sign-in options
                </button>
                <h2
                  id={titleId}
                  data-autofocus
                  tabIndex={-1}
                  className="mt-3 font-display text-2xl font-semibold tracking-[-0.01em] text-content-primary outline-none"
                >
                  {mode === "phone"
                    ? phonePhase === "otp"
                      ? "Enter your verification code"
                      : "Sign in with your phone"
                    : emailCopy.title}
                </h2>
                <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-content-secondary">
                  {mode === "phone"
                    ? phonePhase === "otp"
                      ? "We show a code screen for demonstration. No SMS is delivered in this build."
                      : "We will ask for a verification code on the next screen."
                    : "Your credentials are used for this demonstration only and are never stored."}
                </p>
              </>
            )}

            <span className="chip mt-4 self-start border-crimson-bright/35 bg-crimson/10 text-crimson-bright">
              Demo preview — no live authentication
            </span>

            <div aria-live="polite" className="mt-4">
              {notice && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE_SMOOTH }}
                  className="flex items-start gap-2 rounded-2xl border border-crimson-bright/35 bg-crimson/10 px-4 py-3 text-xs leading-relaxed text-content-primary"
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-crimson-bright" aria-hidden />
                  <span>{notice}</span>
                </motion.p>
              )}
            </div>

            <div aria-live="polite">
              {fieldError && (
                <p id={errorId} className="field-error">
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {fieldError}
                </p>
              )}
            </div>

            {/* ------------------------- chooser ------------------------- */}
            {mode === "chooser" && (
              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={pending !== null}
                  className="btn-secondary w-full justify-center py-3"
                >
                  {pending === "google" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <GoogleGlyph />
                  )}
                  Continue with Google
                </button>

                <button
                  type="button"
                  onClick={() => goToMode("phone")}
                  className="btn-secondary w-full justify-center py-3"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  Continue with Phone Number
                </button>

                <button
                  type="button"
                  onClick={() => goToMode("email")}
                  className="btn-secondary w-full justify-center py-3"
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  Continue with Email
                </button>
              </div>
            )}

            {/* -------------------------- phone -------------------------- */}
            {mode === "phone" && phonePhase === "enter" && (
              <form onSubmit={handleSendOtp} noValidate className="mt-5">
                <label htmlFor={phoneInputId} className="field-label">
                  Mobile number
                </label>
                <div className="flex gap-2">
                  <select
                    aria-label="Country code"
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value)}
                    disabled={pending !== null}
                    className="field w-auto shrink-0 pr-8"
                  >
                    {COUNTRY_CODES.map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                  <input
                    id={phoneInputId}
                    ref={phoneRef}
                    type="tel"
                    name="phone"
                    autoComplete="tel-national"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      if (fieldError) setFieldError("");
                    }}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? errorId : undefined}
                    placeholder="98765 43210"
                    disabled={pending !== null}
                    className="field"
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-content-secondary/80">
                  We will use {normalisedPhone()} for this demonstration only.
                </p>
                <button
                  type="submit"
                  disabled={pending !== null}
                  className="btn-primary mt-4 w-full justify-center py-3"
                >
                  {pending === "phone" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Phone className="h-4 w-4" aria-hidden />
                  )}
                  Send OTP
                </button>
              </form>
            )}

            {/* --------------------------- otp --------------------------- */}
            {mode === "phone" && phonePhase === "otp" && (
              <form onSubmit={handleVerifyOtp} noValidate className="mt-5">
                <label htmlFor={otpInputId} className="field-label">
                  Verification code
                </label>
                <input
                  id={otpInputId}
                  ref={otpRef}
                  type="text"
                  name="otp"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={OTP_LENGTH}
                  value={otp}
                  onChange={(event) => {
                    setOtp(event.target.value.replace(/[^\d]/g, "").slice(0, OTP_LENGTH));
                    if (fieldError) setFieldError("");
                  }}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? errorId : undefined}
                  placeholder={"0".repeat(OTP_LENGTH)}
                  disabled={pending !== null}
                  className="field tracking-[0.4em]"
                />
                <button
                  type="submit"
                  disabled={pending !== null}
                  className="btn-primary mt-4 w-full justify-center py-3"
                >
                  {pending === "email" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                  )}
                  Verify and continue
                </button>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendSeconds > 0}
                    className="btn-ghost px-0 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resendSeconds > 0
                      ? `Resend code in 0:${String(resendSeconds).padStart(2, "0")}`
                      : "Resend code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhonePhase("enter");
                      setOtp("");
                      setFieldError("");
                      setNotice("");
                      setResendSeconds(0);
                    }}
                    className="btn-ghost px-0 py-1 text-xs"
                  >
                    Change number
                  </button>
                </div>
              </form>
            )}

            {/* -------------------------- email -------------------------- */}
            {mode === "email" && (
              <form onSubmit={handleEmailSubmit} noValidate className="mt-5">
                <label htmlFor={emailInputId} className="field-label">
                  Email address
                </label>
                <input
                  id={emailInputId}
                  ref={emailRef}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (fieldError) setFieldError("");
                  }}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? errorId : undefined}
                  placeholder="name@example.com"
                  disabled={pending !== null}
                  className="field"
                />

                {emailMode !== "forgot" && (
                  <>
                    <label htmlFor={passwordInputId} className="field-label mt-4">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id={passwordInputId}
                        type={passwordVisible ? "text" : "password"}
                        name="password"
                        autoComplete={emailMode === "create" ? "new-password" : "current-password"}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          if (fieldError) setFieldError("");
                        }}
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={fieldError ? errorId : undefined}
                        placeholder={emailMode === "create" ? "At least 8 characters" : "Your password"}
                        disabled={pending !== null}
                        className="field pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setPasswordVisible((visible) => !visible)}
                        aria-label={passwordVisible ? "Hide password" : "Show password"}
                        aria-pressed={passwordVisible}
                        className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-content-secondary transition-colors duration-300 hover:bg-blush hover:text-content-primary"
                      >
                        {passwordVisible ? (
                          <EyeOff className="h-4 w-4" aria-hidden />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    </div>
                    {emailMode === "create" && (
                      <p className="mt-2 text-xs leading-relaxed text-content-secondary/80">
                        Passwords are never stored or transmitted by this build.
                      </p>
                    )}
                  </>
                )}

                <button
                  type="submit"
                  disabled={pending !== null}
                  className="btn-primary mt-4 w-full justify-center py-3"
                >
                  {pending === "email" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <SubmitIcon className="h-4 w-4" aria-hidden />
                  )}
                  {emailCopy.submit}
                </button>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {emailMode === "signin" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEmailMode("create");
                          setFieldError("");
                          setNotice("");
                        }}
                        className="btn-ghost px-0 py-1 text-xs"
                      >
                        Create account
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmailMode("forgot");
                          setFieldError("");
                          setNotice("");
                        }}
                        className="btn-ghost px-0 py-1 text-xs"
                      >
                        Forgot password?
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode("signin");
                        setFieldError("");
                        setNotice("");
                      }}
                      className="btn-ghost px-0 py-1 text-xs"
                    >
                      Back to sign in
                    </button>
                  )}
                </div>
              </form>
            )}

            <p className="mt-6 text-center text-[0.68rem] leading-relaxed text-content-secondary/80">
              By continuing you acknowledge the{" "}
              <span className="underline decoration-line decoration-dotted underline-offset-2">
                Privacy Policy (placeholder)
              </span>{" "}
              and{" "}
              <span className="underline decoration-line decoration-dotted underline-offset-2">
                Terms of Use (placeholder)
              </span>
              . These are placeholders in this demonstration build.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
