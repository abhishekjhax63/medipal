import { Link } from "react-router-dom";
import { ArrowRight, HeartHandshake, Sparkles } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { BloodBankHero } from "@/components/blood-bank/BloodBankHero";
import { QuickActions } from "@/components/blood-bank/QuickActions";
import { BloodGroupExplorer } from "@/components/blood-bank/BloodGroupExplorer";
import { DonorInterestForm } from "@/components/blood-bank/DonorInterestForm";
import { BloodAvailabilitySearch } from "@/components/blood-bank/BloodAvailabilitySearch";
import { BloodFacilityDirectory } from "@/components/blood-bank/BloodFacilityDirectory";
import { BloodNetworkMap } from "@/components/blood-bank/BloodNetworkMap";
import { BloodRequestWizard } from "@/components/blood-bank/BloodRequestWizard";
import { BloodRequestTracker } from "@/components/blood-bank/BloodRequestTracker";
import { DonationAwareness } from "@/components/blood-bank/DonationAwareness";
import { BloodBankFaq } from "@/components/blood-bank/BloodBankFaq";
import { scrollToId } from "@/components/blood-bank/bloodBankScroll";

/** Full Blood Bank experience rendered at the default route. */
export function BloodBankExperience() {
  return (
    <main className="relative">
      <BloodBankHero />
      <QuickActions />
      <BloodGroupExplorer />
      <DonorInterestForm />
      <BloodAvailabilitySearch />
      <BloodFacilityDirectory />
      <BloodNetworkMap />
      <BloodRequestWizard />
      <BloodRequestTracker />
      <DonationAwareness />
      <BloodBankFaq />

      {/* Closing CTA band */}
      <section className="section-shell pb-20 sm:pb-24 lg:pb-28">
        <Reveal>
          <div className="glass-panel glass-hairline relative overflow-hidden rounded-4xl px-7 py-12 sm:px-12 sm:py-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_140%_at_12%_0%,rgba(233,30,77,0.14),transparent_58%)]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(233,30,77,0.16),transparent_68%)] blur-2xl"
            />

            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <p className="eyebrow">Next step</p>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] text-content-primary sm:text-[2.4rem]">
                  Ready to take the next step?
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-content-secondary sm:text-base">
                  Register your interest in donating, or ask the MEDIPAL AI health companion about
                  blood donation information.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => scrollToId("donor-registration")}
                  className="btn-primary group whitespace-nowrap"
                >
                  <HeartHandshake className="h-4 w-4" aria-hidden />
                  Become a Donor
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-300 ease-smooth group-hover:translate-x-1"
                    aria-hidden
                  />
                </button>
                <Link to="/ai-doctor" className="btn-secondary whitespace-nowrap">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Talk to MEDIPAL AI
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
