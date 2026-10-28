/**
 * Ambulance — landing page.
 *
 * The first thing on the page is the emergency panel, because the fastest
 * correct action in a real emergency is to telephone, not to fill a form.
 *
 * Everything else on this page is read from the server. When there are no
 * approved operators yet, or no coverage has ever been confirmed, the page says
 * so plainly — it does not decorate the gap with invented cards.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Ambulance,
  ArrowRight,
  ClipboardList,
  Database,
  HeartPulse,
  MapPinned,
  PhoneCall,
  Search,
  ShieldCheck,
  Stethoscope,
  Timer,
} from "lucide-react";
import { AmbulanceEmergencyPanel } from "@/components/ambulance/AmbulanceEmergencyPanel";
import { ProviderCard } from "@/components/ambulance/ProviderCard";
import { EuBadge, EuEmptyState, EuNotice, EuSectionTitle, EuSkeleton } from "@/components/eupchar/ui";
import { CATEGORY_META, formatRelativeTime } from "@/lib/ambulance/presentation";
import { ambulanceApi, AmbulanceApiError } from "@/services/ambulance/api";
import { AMBULANCE_CATEGORIES, type AmbulanceInfo, type AmbulanceProvider } from "@/services/ambulance/types";
import { EASE_SMOOTH } from "@/lib/animations";

const WORKFLOW = [
  { icon: ClipboardList, title: "Tell us the requirement", detail: "Category, urgency and any equipment the patient needs." },
  { icon: MapPinned, title: "Share your location", detail: "Grant location access, or type the pickup address." },
  { icon: Search, title: "Choose the destination", detail: "Search the MEDIPAL hospital directory, or type any place." },
  { icon: Ambulance, title: "See available operators", detail: "Approved operators for that category, with their own latest availability." },
  { icon: PhoneCall, title: "Call or book", detail: "Telephone the operator directly, or record a request on MEDIPAL." },
  { icon: Timer, title: "Follow the status", detail: "The status changes only when the operator confirms it." },
  { icon: ClipboardList, title: "Keep your history", detail: "Your requests stay on this device so you can find them again." },
] as const;

export default function AmbulancePage() {
  const [info, setInfo] = useState<AmbulanceInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [providers, setProviders] = useState<AmbulanceProvider[] | null>(null);
  const [providersNote, setProvidersNote] = useState("");
  const [providersError, setProvidersError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    ambulanceApi
      .info(controller.signal)
      .then(setInfo)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setInfoError(
          error instanceof AmbulanceApiError ? error.message : "MEDIPAL could not load ambulance information.",
        );
      });
    ambulanceApi
      .providers({ limit: 6 }, controller.signal)
      .then((response) => {
        setProviders(response.providers);
        setProvidersNote(response.availabilityNote);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProvidersError(
          error instanceof AmbulanceApiError ? error.message : "MEDIPAL could not load ambulance operators.",
        );
      });
    return () => controller.abort();
  }, []);

  const categories = info?.categories ?? [...AMBULANCE_CATEGORIES];
  const coverage = info?.coverage ?? [];
  const hasCoverage = coverage.some((row) => row.providersTotal > 0);

  return (
    <main className="section-shell pt-28 pb-20 sm:pt-32">
      {/* Hero */}
      <section className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_SMOOTH }}
        >
          <span className="chip">
            <Ambulance className="h-3.5 w-3.5 text-crimson-bright" aria-hidden />
            Ambulance
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-content-primary sm:text-5xl">
            Find and request an <span className="text-gradient-red">ambulance</span> near you
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-content-secondary">
            Compare approved ambulance operators, see what each one reports, and telephone or record
            a request. MEDIPAL is a directory and a record — it is not an emergency dispatch service.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/ambulance/book" className="btn-primary px-6 py-3 text-sm">
              <Ambulance className="h-4 w-4" aria-hidden />
              Book an ambulance
            </Link>
            <Link to="/ambulance/track" className="btn-secondary px-6 py-3 text-sm">
              <Search className="h-4 w-4" aria-hidden />
              Track a request
            </Link>
          </div>

          <p className="mt-5 flex items-start gap-2 text-[0.8rem] leading-relaxed text-content-secondary">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-crimson-bright" aria-hidden />
            No simulated dispatch, no invented fares, no fake driver identities. If MEDIPAL has not
            confirmed something, this page will not print it.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08, ease: EASE_SMOOTH }}
        >
          <AmbulanceEmergencyPanel />
        </motion.div>
      </section>

      {/* Disclaimer */}
      {info && (
        <EuNotice tone="warn" title="How MEDIPAL relates to an emergency" className="mt-8">
          {info.disclaimer}
        </EuNotice>
      )}

      {/* Categories */}
      <section className="mt-16" aria-labelledby="ambulance-categories">
        <EuSectionTitle
          title="Ambulance categories"
          description="Pick the level of care. The operators listed under each category are the ones that actually report running it."
        />
        <div id="ambulance-categories" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category, index) => {
            const meta = CATEGORY_META[category];
            const row = coverage.find((entry) => entry.category === category);
            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: index * 0.05, ease: EASE_SMOOTH }}
                className="glass-panel flex h-full flex-col rounded-3xl p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f04452,#c2183a)] text-sm font-bold text-white">
                  {meta.short}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-content-primary">{category}</h3>
                <p className="mt-1.5 flex-1 text-[0.78rem] leading-relaxed text-content-secondary">
                  {meta.blurb}
                </p>
                <p className="mt-3 border-t border-line pt-3 text-[0.72rem] text-content-secondary">
                  {row && row.providersTotal > 0 ? (
                    <>
                      {row.providersAvailable} available · {row.providersLimited} limited of{" "}
                      {row.providersTotal} listed
                      {row.lastConfirmedAt ? ` · last confirmed ${formatRelativeTime(row.lastConfirmedAt)}` : ""}
                    </>
                  ) : (
                    <>No operator listed yet.</>
                  )}
                </p>
                <Link
                  to={`/ambulance/book?category=${encodeURIComponent(category)}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-crimson-soft"
                >
                  Request this category
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Coverage */}
      <section className="mt-16" aria-labelledby="ambulance-coverage">
        <EuSectionTitle
          title="Confirmed coverage"
          description="Only figures an operator has actually confirmed appear here, with the moment they were given."
        />
        <div id="ambulance-coverage" className="mt-6">
          {!info && !infoError && (
            <div className="glass-panel rounded-3xl p-6">
              <EuSkeleton lines={3} />
            </div>
          )}
          {infoError && (
            <EuNotice tone="error" title="Coverage could not be loaded">
              {infoError}
            </EuNotice>
          )}
          {info && !hasCoverage && (
            <EuEmptyState
              icon={Database}
              title="No operator has confirmed coverage yet"
              description="MEDIPAL has not received a confirmed availability figure from any ambulance operator. Rather than show placeholder numbers, this page stays empty until a real confirmation arrives."
              action={
                <Link to="/ambulance/book" className="btn-primary px-5 py-2.5 text-sm">
                  Record a request anyway
                </Link>
              }
            />
          )}
          {info && hasCoverage && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-[0.7rem] uppercase tracking-[0.14em] text-content-secondary">
                    <th className="px-4 py-1 font-semibold">Category</th>
                    <th className="px-4 py-1 font-semibold">Available</th>
                    <th className="px-4 py-1 font-semibold">Limited</th>
                    <th className="px-4 py-1 font-semibold">Listed</th>
                    <th className="px-4 py-1 font-semibold">Last confirmed</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map((row) => (
                    <tr key={row.category} className="glass-panel-soft">
                      <td className="rounded-l-2xl px-4 py-3 font-medium text-content-primary">
                        {row.category}
                      </td>
                      <td className="px-4 py-3 text-content-secondary">{row.providersAvailable}</td>
                      <td className="px-4 py-3 text-content-secondary">{row.providersLimited}</td>
                      <td className="px-4 py-3 text-content-secondary">{row.providersTotal}</td>
                      <td className="rounded-r-2xl px-4 py-3 text-content-secondary">
                        {formatRelativeTime(row.lastConfirmedAt) ?? "never confirmed"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Operators preview */}
      <section className="mt-16" aria-labelledby="ambulance-operators">
        <EuSectionTitle
          title="Approved operators"
          description="Every operator here passed a MEDIPAL review. Availability and fares are their own latest confirmation."
          action={
            <Link to="/ambulance/book" className="btn-secondary px-4 py-2 text-[0.8rem]">
              Search operators
            </Link>
          }
        />
        <div id="ambulance-operators" className="mt-6">
          {providersError && (
            <EuNotice tone="error" title="Operators could not be loaded">
              {providersError}
            </EuNotice>
          )}
          {!providers && !providersError && (
            <div className="grid gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <div key={key} className="glass-panel rounded-3xl p-5">
                  <EuSkeleton lines={4} />
                </div>
              ))}
            </div>
          )}
          {providers && providers.length === 0 && (
            <EuEmptyState
              icon={Ambulance}
              title="No approved operators yet"
              description="MEDIPAL has not approved any ambulance operator, so there is nobody to show. The platform will not list an unverified operator or invent one to fill this space."
            />
          )}
          {providers && providers.length > 0 && (
            <>
              {providersNote && <p className="mb-4 text-[0.8rem] text-content-secondary">{providersNote}</p>}
              <div className="grid gap-4 lg:grid-cols-3">
                {providers.map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-16" aria-labelledby="ambulance-workflow">
        <EuSectionTitle
          title="How a request works"
          description="Seven steps from the requirement to your own history — with nothing simulated in between."
        />
        <ol id="ambulance-workflow" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW.map((item, index) => (
            <li key={item.title} className="glass-panel flex h-full flex-col rounded-3xl p-5">
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-line bg-white/80 text-crimson-bright">
                  <item.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-content-secondary">
                  Step {index + 1}
                </span>
              </span>
              <h3 className="mt-3 text-sm font-semibold text-content-primary">{item.title}</h3>
              <p className="mt-1.5 text-[0.78rem] leading-relaxed text-content-secondary">{item.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Provenance */}
      {info && info.sources.length > 0 && (
        <section className="mt-16" aria-labelledby="ambulance-sources">
          <EuSectionTitle
            title="Where this information comes from"
            description="Every operator record and every availability claim is traceable to one of these sources."
          />
          <ul id="ambulance-sources" className="mt-6 grid gap-4 lg:grid-cols-2">
            {info.sources.map((source) => (
              <li key={source.id} className="glass-panel rounded-3xl p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-content-primary">{source.name}</h3>
                  <EuBadge tone={source.verification_status === "live" ? "ok" : "neutral"}>
                    {source.verification_status}
                  </EuBadge>
                </div>
                <p className="mt-1 text-[0.74rem] text-content-secondary">{source.provider}</p>
                <p className="mt-2 text-[0.78rem] leading-relaxed text-content-secondary">{source.notes}</p>
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-block text-[0.78rem] font-medium text-crimson-soft"
                  >
                    {source.url}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Cross-links */}
      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          { to: "/", icon: HeartPulse, title: "Blood Bank", body: "Check blood availability and record a blood request." },
          { to: "/ai-doctor", icon: Stethoscope, title: "AI Doctor", body: "Understand a report or prescription before you travel." },
          { to: "/e-upchar", icon: Search, title: "E-UPCHAR", body: "Find a hospital and book a diagnostic service." },
        ].map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="glass-panel group flex items-start gap-3 rounded-3xl p-5 transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-glass-lift"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-white/80 text-crimson-bright">
              <link.icon className="h-4 w-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-content-primary">{link.title}</span>
              <span className="mt-0.5 block text-[0.78rem] leading-relaxed text-content-secondary">
                {link.body}
              </span>
            </span>
          </Link>
        ))}
      </section>

      {/* Admin entry */}
      <section className="mt-12">
        <Link
          to="/ambulance/admin"
          className="inline-flex items-center gap-2 text-[0.8rem] font-medium text-content-secondary transition-colors hover:text-crimson-soft"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Platform operator — ambulance console
        </Link>
      </section>
    </main>
  );
}
