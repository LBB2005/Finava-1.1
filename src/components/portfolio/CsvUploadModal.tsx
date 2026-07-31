"use client";
import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/hooks/useToast";

interface Props {
  onClose: () => void;
  onUpload: (file: File) => Promise<{ imported: number; failed: number }>;
}

export default function CsvUploadModal({ onClose, onUpload }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
  const [error, setError] = useState("");

  async function processFile(file: File) {
    setLoading(true);
    setError("");
    try {
      const r = await onUpload(file);
      setResult(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  return (
    <Modal
      onClose={onClose}
      label="Import holdings from CSV"
      className="w-full max-w-md p-6 mx-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-pop)]"
    >
        <h2 className="text-[length:var(--text-lg)] font-semibold text-[var(--color-text)] mb-2">Import from CSV</h2>
        <p className="text-[length:var(--text-sm)] text-[var(--color-muted)] mb-5">
          Upload a broker export. We detect common column names (Symbol, Shares, Avg Cost, etc.).
        </p>

        {!result ? (
          <div
            className={`border-2 border-dashed rounded-[var(--radius-md)] p-8 text-center cursor-pointer transition-colors ${
              dragging
                ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                : "border-[var(--color-border)] hover:border-[var(--color-accent-medium)]"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
            />
            <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">
              {loading ? "Importing…" : "Drop CSV here or click to browse"}
            </p>
            <p className="text-[length:var(--text-meta)] text-[var(--color-muted)] mt-1">
              .csv, .tsv supported
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-accent-light)] p-4 text-center">
            <p className="font-semibold text-[var(--color-accent)]">
              {result.imported} holdings imported
            </p>
            {result.failed > 0 && (
              <p className="text-[length:var(--text-meta)] text-[var(--color-muted)] mt-1">{result.failed} rows skipped</p>
            )}
          </div>
        )}

        {error && <p className="text-[length:var(--text-sm)] text-[var(--color-bear)] mt-3">{error}</p>}

        <div className="flex justify-end gap-3 mt-5">
          <Button variant="ghost" onClick={onClose}>
            {result ? "Done" : "Cancel"}
          </Button>
        </div>
    </Modal>
  );
}
