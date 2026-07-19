"use client";
import { useState, useRef } from "react";
import { authFetch } from "@/lib/authFetch";
import { apiErrorMessage } from "@/lib/apiErrorMessage";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/hooks/useToast";

interface ExtractedHolding {
  ticker: string;
  companyName: string | null;
  shares: number;
  avgCost: number | null;
}

interface Props {
  onClose: () => void;
  onAdd: (holdings: ExtractedHolding[], buyingPower: number | null, replace: boolean) => Promise<void>;
}

export default function StatementUploadModal({ onClose, onAdd }: Props) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "scanning" | "review" | "adding" | "error">("upload");
  const [extracted, setExtracted] = useState<ExtractedHolding[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [buyingPower, setBuyingPower] = useState<number | null>(null);
  const [buyingPowerInput, setBuyingPowerInput] = useState("");
  const [replaceMode, setReplaceMode] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    const valid = f.type.startsWith("image/") || f.type === "application/pdf";
    if (!valid) { setErrorMsg("Please upload an image or PDF file."); setStep("error"); return; }
    setFile(f);
  }

  async function scan() {
    if (!file) return;
    setStep("scanning");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch("/api/portfolio/statement", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, "Scan failed"));
      const holdings: ExtractedHolding[] = data.holdings;
      const bp: number | null = typeof data.buyingPower === "number" ? data.buyingPower : null;
      setExtracted(holdings);
      setSelected(new Set(holdings.map((_, i) => i)));
      setBuyingPower(bp);
      setBuyingPowerInput(bp != null ? String(bp) : "");
      setStep("review");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      setErrorMsg(msg);
      setStep("error");
      toast.error(msg);
    }
  }

  async function confirm() {
    setStep("adding");
    const toAdd = extracted.filter((_, i) => selected.has(i));
    const bp = buyingPowerInput.trim() !== ""
      ? (parseFloat(buyingPowerInput.replace(/,/g, "")) || null)
      : buyingPower;
    try {
      await onAdd(toAdd, bp, replaceMode);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't add the extracted holdings.";
      setErrorMsg(msg);
      setStep("error");
      toast.error(msg);
    }
  }

  function toggleRow(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  return (
    <Modal
      onClose={onClose}
      label="Upload portfolio statement"
      className="bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-[var(--radius-xl)] shadow-[var(--shadow-pop)] w-full max-w-lg mx-4 overflow-hidden"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Upload Portfolio Statement</h2>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">Photo or PDF — AI will extract your holdings</p>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === "upload" && (
            <div className="flex flex-col gap-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-150 ${
                  dragging ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]" : "border-[var(--color-border)] hover:border-[var(--color-accent-medium)] hover:bg-[var(--color-accent-light)]"
                }`}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mx-auto text-[var(--color-muted)] mb-3">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {file ? (
                  <p className="text-sm font-medium text-[var(--color-accent)]">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[var(--color-text)]">Drop your statement here</p>
                    <p className="text-xs text-[var(--color-muted)] mt-1">PNG, JPG, HEIC, or PDF · Screenshot or scan</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
              <button
                onClick={scan}
                disabled={!file}
                className="w-full py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50 hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Scan with AI
              </button>
            </div>
          )}

          {step === "scanning" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Spinner size={40} className="text-[var(--color-accent)]" />
              <p className="text-sm text-[var(--color-text)]">Scanning statement…</p>
              <p className="text-xs text-[var(--color-muted)]">AI is reading your holdings</p>
            </div>
          )}

          {step === "adding" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Spinner size={40} className="text-[var(--color-accent)]" />
              <p className="text-sm text-[var(--color-text)]">Adding holdings…</p>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--color-bear)_8%,transparent)] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-bear)]">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="text-sm text-[var(--color-text)] font-medium">Something went wrong</p>
              <p className="text-xs text-[var(--color-muted)] text-center">{errorMsg}</p>
              <button onClick={() => { setStep("upload"); setErrorMsg(""); }} className="text-xs text-[var(--color-accent)] hover:underline">Try again</button>
            </div>
          )}

          {step === "review" && (
            <div className="flex flex-col gap-3">
              {/* Replace / Add toggle */}
              <div
                className="flex rounded-lg overflow-hidden text-xs font-medium"
                style={{ border: "1px solid var(--color-border)" }}
              >
                <button
                  onClick={() => setReplaceMode(true)}
                  className="flex-1 py-1.5 transition-colors duration-100"
                  style={{
                    background: replaceMode ? "var(--color-accent)" : "transparent",
                    color: replaceMode ? "white" : "var(--color-text-secondary)",
                  }}
                >
                  Replace portfolio
                </button>
                <button
                  onClick={() => setReplaceMode(false)}
                  className="flex-1 py-1.5 transition-colors duration-100"
                  style={{
                    background: !replaceMode ? "var(--color-accent)" : "transparent",
                    color: !replaceMode ? "white" : "var(--color-text-secondary)",
                  }}
                >
                  Add to portfolio
                </button>
              </div>
              {replaceMode && (
                <p className="text-[10.5px] text-[var(--color-muted)] -mt-1">
                  Existing holdings not in this statement will be removed.
                </p>
              )}
              <p className="text-xs text-[var(--color-muted)]">{extracted.length} holdings found — deselect any you don&apos;t want</p>
              <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                {extracted.map((h, i) => (
                  <label key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors duration-100 ${selected.has(i) ? "bg-[var(--color-accent-light)]" : "hover:bg-[var(--color-surface)]"}`}>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} className="accent-[var(--color-accent)] w-3.5 h-3.5" />
                    <span className="text-xs font-bold text-[var(--color-accent)] w-14">{h.ticker}</span>
                    <span className="flex-1 text-xs text-[var(--color-text-secondary)] truncate">{h.companyName ?? "—"}</span>
                    <span className="text-xs text-[var(--color-text)] font-medium">{h.shares} sh</span>
                    {h.avgCost != null && (
                      <span className="text-xs text-[var(--color-muted)]">@ ${h.avgCost.toFixed(2)}</span>
                    )}
                  </label>
                ))}
              </div>
              {/* Buying power row */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-[var(--color-muted)] flex-shrink-0">
                  <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                </svg>
                <span className="text-xs font-semibold text-[var(--color-text-secondary)] flex-1">Buying Power</span>
                <span className="text-[10px] text-[var(--color-muted)] mr-1">$</span>
                <input
                  type="text"
                  value={buyingPowerInput}
                  onChange={(e) => setBuyingPowerInput(e.target.value)}
                  placeholder={buyingPower != null ? String(buyingPower) : "not detected"}
                  className="w-28 text-right text-xs font-medium bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-[var(--color-text)] tabular-nums"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep("upload")} className="flex-1 py-2 rounded-xl border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] transition-colors">
                  Re-scan
                </button>
                <button
                  onClick={confirm}
                  disabled={selected.size === 0}
                  className="flex-1 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50 hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  {replaceMode ? "Replace portfolio" : `Add ${selected.size} holding${selected.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
}
