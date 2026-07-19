"use client";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/hooks/useToast";
import type { HoldingFormData } from "@/types/portfolio";

interface Props {
  onClose: () => void;
  onAdd: (data: HoldingFormData) => Promise<void>;
}

export default function AddHoldingModal({ onClose, onAdd }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<HoldingFormData>({
    ticker: "",
    shares: 0,
    avgCost: 0,
    companyName: "",
    sector: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker || form.shares <= 0) {
      setError("Ticker and shares are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onAdd(form);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add holding";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} label="Add holding">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-5">Add Holding</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Ticker Symbol"
            placeholder="AAPL"
            value={form.ticker}
            onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
            required
          />
          <Input
            label="Company Name (optional)"
            placeholder="Apple Inc."
            value={form.companyName ?? ""}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Shares"
              type="number"
              placeholder="100"
              min="0"
              step="any"
              value={form.shares || ""}
              onChange={(e) => setForm({ ...form, shares: parseFloat(e.target.value) || 0 })}
              required
            />
            <Input
              label="Avg Cost ($)"
              type="number"
              placeholder="150.00"
              min="0"
              step="any"
              value={form.avgCost || ""}
              onChange={(e) => setForm({ ...form, avgCost: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <Input
            label="Sector (optional)"
            placeholder="Technology"
            value={form.sector ?? ""}
            onChange={(e) => setForm({ ...form, sector: e.target.value })}
          />
          {error && <p className="text-sm text-[var(--color-bear)]">{error}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding…" : "Add Holding"}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
