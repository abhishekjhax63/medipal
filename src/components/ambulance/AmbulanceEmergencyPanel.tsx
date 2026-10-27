/**
 * Emergency shortcuts for the Ambulance module.
 *
 * These are plain telephone links to India's official emergency numbers. MEDIPAL
 * does not place, route, or dispatch any of these calls — tapping one simply
 * opens the phone's dialler, exactly as if the number were typed by hand.
 *
 * The numbers are fetched from the server's own emergency register. If that
 * request fails, MEDIPAL still shows the built-in national numbers, clearly
 * labelled as the offline copy, because hiding them would be the unsafe choice.
 */

import { Phone, ShieldAlert } from "lucide-react";
import { EuBadge, EuNotice } from "@/components/eupchar/ui";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";
import { ambulanceApi, AmbulanceApiError } from "@/services/ambulance/api";
import type { AmbulanceEmergencyContact } from "@/services/ambulance/types";

/**
 * Well-known national emergency numbers. Kept deliberately tiny and limited to
 * numbers that are the same across all of India, so nothing here is a guess.
 */
const OFFLINE_CONTACTS: AmbulanceEmergencyContact[] = [
  {
    id: "india_erss",
    label: "National emergency number",
    number: "112",
    dial: "tel:112",
    scope: "All of India — single emergency response number",
    region: "IN",
    url: "https://112.gov.in/",
    notes: "India's Emergency Response Support System. Dialling 112 connects you to the official emergency service, which can arrange police, fire or an ambulance.",
  },
  {
    id: "national_ambulance_108",
    label: "Emergency ambulance (108)",
    number: "108",
    dial: "tel:108",
    scope: "Most states and union territories",
    region: "IN",
    url: null,
    notes: "The emergency ambulance service operated across most Indian states. Availability varies by state.",
  },
  {
    id: "pregnancy_child_102",
    label: "Pregnancy, mother & child (102)",
    number: "102",
    dial: "tel:102",
    scope: "Most states and union territories",
    region: "IN",
    url: null,
    notes: "Non-emergency transport for pregnant women and children, operated across most Indian states.",
  },
];

type PanelState =
  | { kind: "loading" }
  | { kind: "ready"; contacts: AmbulanceEmergencyContact[]; disclaimer: string }
  | { kind: "offline"; message: string };

export function AmbulanceEmergencyPanel({ className }: { className?: string }) {
  const [state, setState] = useState<PanelState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    ambulanceApi
      .emergency(controller.signal)
      .then((data) => setState({ kind: "ready", contacts: data.contacts, disclaimer: data.disclaimer }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message =
          error instanceof AmbulanceApiError
            ? error.message
            : "MEDIPAL could not reach its emergency register.";
        setState({ kind: "offline", message });
      });
    return () => controller.abort();
  }, []);

  const contacts = state.kind === "ready" ? state.contacts : OFFLINE_CONTACTS;

  return (
    <section
      aria-labelledby="ambulance-emergency-heading"
      className={cn(
        "glass-panel glass-hairline relative overflow-hidden rounded-4xl p-6 sm:p-8",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2E86DE,#0A3D75)] text-white shadow-glow-red-sm">
          <ShieldAlert className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2
            id="ambulance-emergency-heading"
            className="font-display text-lg font-semibold text-content-primary"
          >
            In a life-threatening emergency, call first
          </h2>
          <p className="mt-0.5 text-sm text-content-secondary">
            Telephone 112 or your state's ambulance number before anything else.
          </p>
        </div>
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {contacts.map((contact) => (
          <li key={contact.id}>
            <a
              href={contact.dial}
              className="group flex h-full flex-col rounded-3xl border border-line bg-white/80 p-4 backdrop-blur-md transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-crimson/45 hover:shadow-glass"
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-content-secondary">
                <Phone className="h-3.5 w-3.5 text-crimson-bright" aria-hidden />
                {contact.label}
              </span>
              <span className="mt-2 font-display text-3xl font-semibold tracking-tight text-content-primary">
                {contact.number}
              </span>
              <span className="mt-1 text-[0.78rem] leading-relaxed text-content-secondary">
                {contact.scope}
              </span>
            </a>
          </li>
        ))}
      </ul>

      {state.kind === "offline" ? (
        <EuNotice tone="warn" title="Showing MEDIPAL's built-in emergency list" className="mt-4">
          {state.message} These national numbers are unchanged, so they are still safe to dial.
        </EuNotice>
      ) : state.kind === "ready" ? (
        <p className="mt-4 text-xs leading-relaxed text-content-secondary/90">{state.disclaimer}</p>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-xs text-content-secondary">
          <EuBadge tone="neutral">Checking the emergency register…</EuBadge>
        </p>
      )}
    </section>
  );
}
