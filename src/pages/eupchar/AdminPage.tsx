import { LockKeyhole, ShieldCheck, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuCard, EuNotice } from "@/components/eupchar/ui";

/**
 * A browser role picker is not access control. The former screen let visitors
 * choose “admin” locally and edit a transient catalogue, which is unsafe and
 * misleading. Admin writes now exist only behind the server-side signed
 * identity gateway; until an authorised console consumes that gateway, this
 * route explicitly reports that it is unavailable.
 */
export default function AdminPage() {
  return (
    <EuShell>
      <EuPageHeader
        eyebrow="E-UPCHAR · Administration"
        title="Secure administration required"
        description="Hospital service, price and availability management is available only through a verified administrator session. MEDIPAL will not accept a role selected in the browser."
      />

      <EuNotice tone="warn" title="No administrator session is connected">
        Sign in through the configured identity gateway before using an approved staff console. No
        hospital catalogue, availability or price can be changed from this public page.
      </EuNotice>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <EuCard className="p-5">
          <LockKeyhole className="h-5 w-5 text-eu-red" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold text-eu-text">Server-side role checks</h2>
          <p className="mt-1.5 text-[0.8rem] leading-relaxed text-eu-muted">The API verifies a signed identity and checks the administrator role before a write is allowed.</p>
        </EuCard>
        <EuCard className="p-5">
          <ShieldCheck className="h-5 w-5 text-eu-red" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold text-eu-text">Verified facts only</h2>
          <p className="mt-1.5 text-[0.8rem] leading-relaxed text-eu-muted">A hospital service, price or booking setting must be supplied by an authorised source before it can be published.</p>
        </EuCard>
        <EuCard className="p-5">
          <Wrench className="h-5 w-5 text-eu-red" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold text-eu-text">Integration pending</h2>
          <p className="mt-1.5 text-[0.8rem] leading-relaxed text-eu-muted">The identity gateway and staff-console integration still need deployment-specific credentials and approval.</p>
        </EuCard>
      </div>

      <Link to="/e-upchar/hospitals" className="eu-btn eu-btn-secondary mt-7 inline-flex gap-2 px-4 py-2.5">
        Return to hospital directory
      </Link>
    </EuShell>
  );
}
