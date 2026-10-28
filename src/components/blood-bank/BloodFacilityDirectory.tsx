import { GlassCard } from "@/components/ui/GlassCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { FacilityFinder } from "@/components/facilities/FacilityFinder";

/**
 * Real blood-service directory for the Blood Bank page.
 *
 * This is a *location* search over OpenStreetMap. It is deliberately separate
 * from `BloodAvailabilitySearch`: that panel shows stock figures a facility
 * reported to MEDIPAL, this one only shows where blood services actually are.
 * A facility appearing on the map is never presented as holding a blood group.
 */
export function BloodFacilityDirectory() {
  return (
    <section id="blood-facility-directory" className="section-shell section-pad scroll-mt-28">
      <SectionHeading
        eyebrow="Real facilities"
        title="Find hospitals & blood services near you"
        description="A live search over OpenStreetMap: real facility names, addresses, coordinates, phone numbers and websites exactly as contributors recorded them. Nothing is added that the source does not publish."
      />

      <GlassCard hairline interactive={false} className="mt-14 p-7 sm:p-9">
        <FacilityFinder
          tone="blood"
          title="Search blood services by location"
          description="Enter a city, area or PIN code, or share your location. Results are sorted by the real distance from that point, and each entry links to its OpenStreetMap source record."
          kinds={["blood_bank", "hospital", "clinic"]}
          initialKinds={["blood_bank"]}
          initialRadiusKm={10}
          notice="Finding a hospital or blood bank on a map does not prove that a particular blood group is available. Any stock figure MEDIPAL shows comes only from a facility that actually reported it — see the reported-stock search above."
        />
      </GlassCard>
    </section>
  );
}
