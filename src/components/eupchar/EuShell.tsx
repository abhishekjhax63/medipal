import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Database } from "lucide-react";
import { cn } from "@/lib/cn";
import { hospitalDatasetMeta } from "@/data/eupchar/directory";
import { EuBreadcrumb } from "@/components/eupchar/ui";

/**
 * Page frame for every E-UPCHAR screen. Applies the light clinical scope and
 * keeps the dataset provenance visible on the browse surfaces.
 */
export function EuShell({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("eu-scope relative flex-1 bg-eu-bg", className)}>
      <div className={cn("mx-auto w-full px-4 pb-20 pt-24 sm:px-6 sm:pt-28 lg:px-8", wide ? "max-w-7xl" : "max-w-6xl")}>
        {children}
      </div>
    </div>
  );
}

export function EuPageHeader({
  eyebrow,
  title,
  description,
  breadcrumb,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: readonly { label: string; to?: string }[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-7", className)}>
      {breadcrumb && breadcrumb.length > 0 && <EuBreadcrumb items={breadcrumb} />}
      {eyebrow && <p className="eu-eyebrow mb-2 text-eu-red-deep">{eyebrow}</p>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-eu-text sm:text-3xl">{title}</h1>
          {description && (
            <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-eu-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * Collapsible provenance note. E-UPCHAR must always be able to answer
 * "where did this hospital list come from?" without a marketing claim.
 */
export function EuDatasetNote({ className }: { className?: string }) {
  return (
    <details
      className={cn(
        "group rounded-2xl border border-eu-border bg-eu-surface px-4 py-3 text-[0.8rem] text-eu-muted",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-eu-text">
        <Database className="h-3.5 w-3.5 text-eu-muted" aria-hidden />
        Where this hospital list comes from
        <span aria-hidden className="ml-auto text-eu-muted transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        <p>
          {hospitalDatasetMeta.recordCount} records from{" "}
          <span className="font-medium text-eu-text">{hospitalDatasetMeta.sourceFile}</span>, prepared{" "}
          {hospitalDatasetMeta.preparedOn}. {hospitalDatasetMeta.verificationNote}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {hospitalDatasetMeta.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
        <p>
          Official status is published by the Government. Verify any hospital on the official
          PM-JAY / Bihar empanelment search before relying on it.
        </p>
      </div>
    </details>
  );
}

export function EuBackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="eu-btn-quiet -ml-2 px-2 py-1.5 text-[0.82rem] hover:underline"
    >
      {children}
    </Link>
  );
}
