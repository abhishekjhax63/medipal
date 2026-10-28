import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, PhoneCall } from "lucide-react";

/**
 * Small, plain-language information pages linked from the footer.
 *
 * They are deliberately short and factual: on a health platform a policy page
 * that over-claims is worse than no page at all, so each one states only what
 * the system actually does and points to the real service pages for anything
 * else. They share one shell so the reading experience is identical.
 */
function InfoPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <main className="section-shell section-pad">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">MEDIPAL</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-content-primary sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-content-secondary">{summary}</p>

        <div className="mt-8 space-y-7 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
          {children}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-content-secondary">
          This page describes the current build of MEDIPAL in plain language. It is not legal advice
          and will be reviewed with qualified advisers before any public launch.
        </p>
      </div>
    </main>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-content-primary">{heading}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-content-secondary">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: readonly ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function EmergencyInfoPage() {
  return (
    <InfoPage
      title="Emergency information"
      summary="MEDIPAL helps you find healthcare services. It is not an emergency service, and it does not send help to you."
    >
      <div className="surface-alert flex gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
        <div className="text-sm leading-relaxed text-content-primary">
          <p className="font-semibold">In a life-threatening emergency, call first.</p>
          <p className="mt-1">
            Dial <strong>112</strong> — the national emergency number — or <strong>108</strong> for
            an ambulance. Do not wait for a response from any website or app before calling.
          </p>
        </div>
      </div>

      <Section heading="Call the right number">
        <BulletList
          items={[
            <>
              <strong>112</strong> — a single number for police, fire and medical emergencies
              anywhere in India.
            </>,
            <>
              <strong>108</strong> — the emergency ambulance service.
            </>,
            <>
              If you know which hospital you are going to, call that hospital's own published
              emergency number as well.
            </>,
          ]}
        />
        <div className="flex flex-wrap gap-3 pt-1">
          <a href="tel:112" className="btn-danger">
            <PhoneCall className="h-4 w-4" aria-hidden />
            Call 112
          </a>
          <a href="tel:108" className="btn-secondary">
            Call 108
          </a>
        </div>
      </Section>

      <Section heading="What MEDIPAL can do">
        <p>
          MEDIPAL can help you find published information while you are dealing with an emergency —
          it cannot act on your behalf.
        </p>
        <BulletList
          items={[
            <>
              Find blood centres and any published contact numbers in{" "}
              <Link to="/blood-bank" className="font-medium text-brand-deep hover:underline">
                Blood Bank
              </Link>
              .
            </>,
            <>
              Read published ambulance provider details in{" "}
              <Link to="/ambulance" className="font-medium text-brand-deep hover:underline">
                Ambulance assistance
              </Link>
              .
            </>,
            <>
              Find hospital contact details and services in{" "}
              <Link to="/e-upchar" className="font-medium text-brand-deep hover:underline">
                E-UPCHAR
              </Link>
              .
            </>,
          ]}
        />
      </Section>

      <Section heading="What MEDIPAL cannot do">
        <BulletList
          items={[
            "It does not dispatch an ambulance, a doctor, blood or any other resource.",
            "It does not confirm that a provider has accepted your request. A request is only confirmed when the provider tells you so directly.",
            "It does not give medical advice, a diagnosis or treatment.",
            "It cannot guarantee that any listed facility, blood group or vehicle is available right now.",
          ]}
        />
      </Section>
    </InfoPage>
  );
}

export function PrivacyPolicyPage() {
  return (
    <InfoPage
      title="Privacy policy"
      summary="A plain-language summary of what this build of MEDIPAL does with the information you enter."
    >
      <Section heading="Location">
        <p>
          Your location is requested only after you press a location button, and never in the
          background. If you decline, you can still search by choosing a state, district or area
          yourself. Location is used to sort and filter the results on the page you are viewing.
        </p>
      </Section>

      <Section heading="Searches">
        <p>
          When you search, the location, area and blood group you entered are sent to the MEDIPAL
          server so it can look up facilities on your behalf. Nothing is sent until you submit a
          search.
        </p>
      </Section>

      <Section heading="AI Doctor">
        <p>
          Messages and any image you upload in the AI Doctor are forwarded to the configured AI
          provider so a reply can be generated. Treat that conversation like typing into a
          third-party tool: do not include an identification number, a full address or anything else
          you would not want processed outside your device.
        </p>
      </Section>

      <Section heading="Accounts">
        <p>
          No account system is connected to this build. The sign-in panel does not create an account
          and MEDIPAL does not store a profile, password or medical history for you.
        </p>
      </Section>

      <Section heading="Questions">
        <p>
          Write to{" "}
          <a href="mailto:flex8india@gmail.com" className="font-medium text-brand-deep hover:underline">
            flex8india@gmail.com
          </a>{" "}
          or use the{" "}
          <Link to="/contact" className="font-medium text-brand-deep hover:underline">
            contact page
          </Link>
          .
        </p>
      </Section>
    </InfoPage>
  );
}

export function TermsPage() {
  return (
    <InfoPage
      title="Terms of use"
      summary="MEDIPAL is an information and coordination platform. It is not a hospital, a blood bank, an ambulance operator or a doctor."
    >
      <Section heading="No medical advice">
        <p>
          Content on MEDIPAL is general health information. It is not a diagnosis, a treatment plan
          or a substitute for a consultation with a qualified healthcare professional.
        </p>
      </Section>

      <Section heading="Not an emergency service">
        <p>
          MEDIPAL does not dispatch help. In an emergency, call <strong>112</strong> or{" "}
          <strong>108</strong>. See{" "}
          <Link to="/emergency" className="font-medium text-brand-deep hover:underline">
            emergency information
          </Link>
          .
        </p>
      </Section>

      <Section heading="Verify before you rely on it">
        <BulletList
          items={[
            "Facility names, addresses and contact details are compiled from public sources and can go out of date. Confirm with the facility before travelling.",
            "Blood availability is only as current as the source that published it. Where no live source is connected, MEDIPAL says so instead of showing a figure.",
            "A price is only shown as verified when it carries a named source and a verification date. Anything else is labelled as unverified — contact the provider to confirm the amount payable.",
            "MEDIPAL does not invent appointment slots or prices. If no slot or price is published, the page says so.",
          ]}
        />
      </Section>

      <Section heading="Bookings and requests">
        <p>
          A booking or request you submit on MEDIPAL is a request, not a confirmation. It is
          confirmed only when the provider accepts it directly.
        </p>
      </Section>

      <div className="pt-1">
        <Link to="/blood-bank" className="btn-primary">
          Go to Blood Bank
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </InfoPage>
  );
}
