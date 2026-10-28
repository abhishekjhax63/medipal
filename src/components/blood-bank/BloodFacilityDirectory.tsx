import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { FacilityFinder } from "@/components/facilities/FacilityFinder";
import { BloodCentreCards } from "@/components/blood-bank/BloodCentreCards";

/**
 * Real blood-service directory for the Blood Bank page.
 *
 * Two genuinely different sources, shown one after the other and never blended:
 *
 *  1. `BloodCentreCards` — centres approved by MEDIPAL, each with the stock it
 *     actually reported, its verification status, a call button and directions.
 *     A centre that has reported nothing says so.
 *  2. `FacilityFinder` — a *location* search over OpenStreetMap. It says where
 *     blood services are; it holds no stock figure of any kind, and a facility
 *     appearing there is never presented as holding a blood group.
 */
export function BloodFacilityDirectory() {
  return (
    <section id="blood-facility-directory" className="section-shell section-pad scroll-mt-28">
      <SectionHeading
        eyebrow="Real facilities"
        title="Blood centres, their reported stock, and how to reach them"
        description="Approved MEDIPAL centres come first, with the figures they reported, a direct call button and one-click directions. Below that is a live OpenStreetMap search for other hospitals and blood services nearby."
      />

      <GlassCard hairline interactive={false} className="mt-14 p-7 sm:p-9">
        <BloodCentreCards />
      </GlassCard>

      <GlassCard hairline interactive={false} className="mt-8 p-7 sm:p-9">
        <FacilityFinder
          tone="blood"
          title="Search blood services by location"
          description="Enter a city, area or PIN code, or share your location. Results are sorted by the real distance from that point, and each entry links to its OpenStreetMap source record."
          kinds={["blood_bank", "hospital", "clinic"]}
          initialKinds={["blood_bank"]}
          initialRadiusKm={10}
          notice="Finding a hospital or blood bank on a map does not prove that a particular blood group is available. Any stock figure MEDIPAL shows comes only from a centre that actually reported it — see the registry cards above."
        />
      </GlassCard>
    </section>
  );
}
