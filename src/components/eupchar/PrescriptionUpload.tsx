import { useRef } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { addDocument, removeDocument, selectDocuments } from "@/services/eupchar/repository";
import { useEuState } from "@/hooks/eupchar/useEuStore";
import { E_UPCHAR_COPY } from "@/types/eupchar";

/**
 * Prescription capture (spec §13).
 *
 * Only file metadata is recorded locally; the binary is never written to browser
 * storage and no public URL is produced. In a connected deployment the file goes
 * to a private, access-controlled object path.
 */
export function PrescriptionUpload({
  patientId,
  documentId,
  onChange,
}: {
  patientId: string | null;
  documentId: string | null;
  onChange: (documentId: string | null) => void;
}) {
  const state = useEuState();
  const documents = selectDocuments(state);
  const current = documentId ? documents.find((doc) => doc.id === documentId) ?? null : null;
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const record = addDocument({
      kind: "prescription",
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      patientId,
      bookingId: null,
    });
    onChange(record.id);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemove() {
    if (current) removeDocument(current.id);
    onChange(null);
  }

  return (
    <div className="rounded-2xl border border-eu-border bg-eu-bg p-4">
      <h3 className="text-[0.95rem] font-semibold text-eu-text">{E_UPCHAR_COPY.prescriptionHeading}</h3>
      <p className="mt-1 text-sm text-eu-muted">{E_UPCHAR_COPY.prescriptionBody}</p>

      {current ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-eu-border bg-eu-surface px-4 py-3">
          <FileText className="h-4 w-4 shrink-0 text-eu-red" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-eu-text">{current.fileName}</p>
            <p className="text-[0.72rem] text-eu-muted">
              {(current.sizeBytes / 1024).toFixed(0)} KB · stored for this booking only, private path
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="eu-btn eu-btn-quiet gap-1.5 px-2.5 py-1.5 text-[0.78rem] text-eu-red-deep"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Remove
          </button>
        </div>
      ) : (
        <label className="mt-4 flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-eu-border bg-eu-surface px-4 py-6 text-center transition-colors hover:border-eu-red">
          <Upload className="h-5 w-5 text-eu-muted" aria-hidden />
          <span className="mt-2 text-sm font-medium text-eu-text">Choose a prescription file</span>
          <span className="mt-0.5 text-[0.72rem] text-eu-muted">PDF, JPG or PNG · up to 10 MB</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={handleFile}
          />
        </label>
      )}
    </div>
  );
}
