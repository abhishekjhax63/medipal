import { AIDoctorExperience } from "@/components/ai-doctor/AIDoctorExperience";

/** Route "/ai-doctor" — the light MEDIPAL AI Doctor companion experience. */
export default function AIDoctorPage() {
  return (
    <main className="relative flex-1">
      <AIDoctorExperience />
    </main>
  );
}
