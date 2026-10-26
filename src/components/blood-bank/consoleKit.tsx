/**
 * Shared building blocks for the two Blood Bank operator consoles.
 *
 * One rule these consoles cannot break: a secret — a facility bearer token or
 * the platform-admin key — lives in React state for the lifetime of the tab
 * only. It is never written to localStorage, sessionStorage, the URL or a log.
 *
 * Nothing here invents data either. A failed request is always rendered as a
 * failure carrying the server's own message and code, so a broken backend can
 * never be mistaken for "there is nothing to show".
 */

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, LoaderCircle, RefreshCw } from "lucide-react";
import { EuCard, EuNotice } from "@/components/eupchar/ui";
import { cn } from "@/lib/cn";
import { BloodApiError } from "@/services/blood/api";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export interface ConsoleError {
  message: string;
  code: string;
}

export function describeError(error: unknown): ConsoleError {
  if (error instanceof BloodApiError) return { message: error.message, code: error.code };
  if (error instanceof DOMException && error.name === "AbortError") {
    return { message: "The request was cancelled before it finished.", code: "ABORTED" };
  }
  if (error instanceof Error) return { message: error.message, code: "UNEXPECTED" };
  return { message: "Something went wrong. Please try again.", code: "UNKNOWN" };
}

/* ------------------------------------------------------------------ */
/* Async state                                                         */
/* ------------------------------------------------------------------ */

export type Resource<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "error"; message: string; code: string };

/** Loads once on mount, and again whenever `deps` or a manual reload change. */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[] = []) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<Resource<T>>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    load()
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((error) => {
        if (!cancelled) setState({ kind: "error", ...describeError(error) });
      });
    return () => {
      cancelled = true;
    };
    // `load` is intentionally excluded: it is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  return { state, reload: () => setNonce((value) => value + 1) };
}

export interface ActionState {
  busy: boolean;
  message: string | null;
  tone: "ok" | "error" | null;
}

/** Runs a write and surfaces the server's own wording on both outcomes. */
export function useAction() {
  const [state, setState] = useState<ActionState>({ busy: false, message: null, tone: null });

  async function run(task: () => Promise<string>, onSuccess?: () => void): Promise<boolean> {
    setState({ busy: true, message: null, tone: null });
    try {
      const message = await task();
      setState({ busy: false, message, tone: "ok" });
      onSuccess?.();
      return true;
    } catch (error) {
      setState({ busy: false, message: describeError(error).message, tone: "error" });
      return false;
    }
  }

  return { ...state, run, reset: () => setState({ busy: false, message: null, tone: null }) };
}

/* ------------------------------------------------------------------ */
/* Presentational helpers                                              */
/* ------------------------------------------------------------------ */

export function LoadingCard({ label = "Loading…" }: { label?: string }) {
  return (
    <EuCard className="flex items-center gap-3 p-6 text-sm text-eu-muted" >
      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </EuCard>
  );
}

export function ErrorState({ error, onRetry }: { error: ConsoleError; onRetry?: () => void }) {
  return (
    <EuNotice
      tone="error"
      title="That request did not succeed"
      action={
        onRetry ? (
          <button type="button" onClick={onRetry} className="eu-btn eu-btn-secondary gap-2 px-3 py-2 text-[0.78rem]">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </button>
        ) : undefined
      }
    >
      {error.message} <span className="ml-1 font-mono text-[0.7rem]">{error.code}</span>
    </EuNotice>
  );
}

export function ActionFeedback({ tone, message }: { tone: ActionState["tone"]; message: string | null }) {
  if (!message || !tone) return null;
  return (
    <EuNotice tone={tone === "error" ? "error" : "info"} className="mt-4">
      {message}
    </EuNotice>
  );
}

/** Status chip driven by the shared Blood Bank tone map. */
export function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em]",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eu-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.72rem] leading-relaxed text-eu-muted">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* One-time secrets                                                    */
/* ------------------------------------------------------------------ */

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shows a credential exactly as the server returned it. The server keeps only a
 * hash, so this is the one moment the value exists in readable form.
 */
export function SecretReveal({ label, token }: { label: string; token: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl border border-[#f0dcb4] bg-[#fdf6e6] p-4">
      <p className="text-sm font-semibold text-[#8a5200]">{label}</p>
      <p className="mt-1 text-[0.8rem] leading-relaxed text-eu-muted">
        Copy it now. MEDIPAL stores only a hash of this value, so it can never be shown again.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-eu-border bg-eu-bg px-3 py-2 font-mono text-[0.76rem] text-eu-text">
          {token}
        </code>
        <button
          type="button"
          onClick={() => {
            void copyText(token).then((ok) => setCopied(ok));
          }}
          className="eu-btn eu-btn-secondary gap-1.5 px-3 py-2 text-[0.75rem]"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
