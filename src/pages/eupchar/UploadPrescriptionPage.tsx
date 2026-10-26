import { Building2, FileText, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { EuPageHeader, EuShell } from "@/components/eupchar/EuShell";
import { EuBadge, EuCard, EuEmptyState, EuSectionTitle } from "@/components/eupchar/ui";
import { PrescriptionUpload } from "@/components/eupchar/PrescriptionUpload";
import { PracticeModeExplainer } from "@/components/eupchar/PracticeModeToggle";
import { selectDocuments, selectLocationSelection } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { useEupcharBooking } from "@/context/EupcharBookingContext";
import { formatDateTime } from "@/lib/eupchar/format";
import { E_UPCHAR_COPY } from "@/types/eupchar";

/**
 * Start a booking from a prescription (spec §13).
 *
 * Uploading a prescription is a booking input, not an order — it never creates a
 * charge on its own. From here the visitor picks the hospital and service that
 * will actually perform the test.
 */
export default function UploadPrescriptionPage() {
  const state = useEuState();
  const { draft, patchDraft } = useEupcharBooking();
  const documents = selectDocuments(state).filter((doc) => doc.kind === "prescription");
  const selection = selectLocationSelection(state);

  return (
    <EuShell>
      <EuPageHeader
        eyebrow="E-UPCHAR"
        title={E_UPCHAR_COPY.prescriptionHeading}
        description={E_UPCHAR_COPY.prescriptionBody}
        breadcrumb={[
          { label: "E-UPCHAR", to: "/e-upchar" },
          { label: E_UPCHAR_COPY.prescriptionHeading },
        ]}
      />

      <PracticeModeExplainer className="mb-5" />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <PrescriptionUpload
            patientId={draft.patientId}
            documentId={draft.prescriptionDocumentId}
            onChange={(documentId) => patchDraft({ prescriptionDocumentId: documentId })}
          />

          <EuCard className="p-5">
            <EuSectionTitle
              title="Next step"
              description="Pick the hospital that will perform the test, then choose the service."
            />
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                to={selection?.hospitalId ? `/e-upchar/hospitals/${selection.hospitalId}` : "/e-upchar/hospitals"}
                className="eu-btn eu-btn-primary gap-2 px-4 py-2.5"
              >
                <Building2 className="h-4 w-4" aria-hidden />
                {selection?.hospitalId ? "Open selected hospital" : "Choose a hospital"}
              </Link>
              <Link to="/e-upchar/location" className="eu-btn eu-btn-secondary px-4 py-2.5">
                Select Location
              </Link>
            </div>
          </EuCard>
        </div>

        <aside>
          <EuCard className="p-5">
            <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold text-eu-text">
              <FileText className="h-4 w-4 text-eu-red" aria-hidden />
              Your uploaded prescriptions
            </h2>
            {documents.length === 0 ? (
              <EuEmptyState
                className="mt-4"
                icon={Upload}
                title="Nothing uploaded yet"
                description="Files you add here appear in this list for this session."
              />
            ) : (
              <ul className="mt-4 space-y-2.5">
                {documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex items-center gap-3 rounded-xl border border-eu-border bg-eu-surface px-3.5 py-2.5"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-eu-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.85rem] text-eu-text">{document.fileName}</span>
                      <span className="block text-[0.7rem] text-eu-muted">
                        {formatDateTime(document.uploadedAt)}
                      </span>
                    </span>
                    {document.id === draft.prescriptionDocumentId && <EuBadge tone="red">In use</EuBadge>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[0.72rem] leading-relaxed text-eu-muted">
              Prescriptions are stored against a private path and are not published to any public URL.
              Only the file's details are kept in this browser session.
            </p>
          </EuCard>
        </aside>
      </div>
    </EuShell>
  );
}
