"use client";
import { useState } from "react";
import useSWR from "swr";
import { authFetch, authFetcher } from "@/lib/authFetch";
import { useToast } from "@/hooks/useToast";
import { Card } from "./DnaPrimitives";
import type { Conviction } from "@/types/dna";

const STATUS_META: Record<string, { label: string; color: string }> = {
  forming: { label: "Forming", color: "var(--color-muted)" },
  playing_out: { label: "Playing out", color: "var(--color-bull)" },
  broken: { label: "Broken", color: "var(--color-bear)" },
  closed: { label: "Closed", color: "var(--color-muted)" },
};

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: "8px 11px", borderRadius: 8,
  border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)",
};

/** The Conviction Ledger — theses with their falsifiers and live status. */
export default function ConvictionLedger() {
  const { data, mutate, isLoading } = useSWR<Conviction[]>("/api/convictions", authFetcher);
  const [adding, setAdding] = useState(false);
  const convictions = data ?? [];

  return (
    <Card
      title="Conviction ledger"
      action={
        <button className="tbtn" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "Add conviction"}
        </button>
      }
    >
      {adding && <AddForm onDone={async () => { setAdding(false); await mutate(); }} />}

      {isLoading ? (
        <p style={{ fontSize: 13, color: "var(--color-muted)" }}>Loading…</p>
      ) : convictions.length === 0 && !adding ? (
        <p style={{ fontSize: 13, color: "var(--color-muted)", lineHeight: 1.6 }}>
          No convictions yet. Finava will start drafting these from your research — or add one now to
          anchor a thesis with the falsifier that would change your mind.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {convictions.map((c, i) => (
            <Row key={c.id} c={c} last={i === convictions.length - 1} onChange={() => { mutate(); }} />
          ))}
        </div>
      )}
    </Card>
  );
}

function Row({ c, last, onChange }: { c: Conviction; last: boolean; onChange: () => void | Promise<void> }) {
  const toast = useToast();
  const meta = STATUS_META[c.status] ?? STATUS_META.forming;

  async function setStatus(status: string) {
    try {
      await authFetch(`/api/convictions/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await onChange();
    } catch {
      toast.error("Couldn't update that conviction.");
    }
  }

  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "flex-start",
      padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--color-border)",
    }}>
      <div style={{ width: 52, fontSize: 13, fontWeight: 700, color: "var(--color-accent)" }}>{c.ticker}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: "var(--color-text)" }}>
          <span style={{ textTransform: "capitalize", color: "var(--color-text-secondary)" }}>{c.direction}</span>
          {" · "}{c.thesisTrait}
        </div>
        {c.falsifier && (
          <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 3 }}>Wrong if {c.falsifier}</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
        <select
          value={c.status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Conviction status"
          style={{
            fontSize: 11, color: meta.color, background: "transparent",
            border: "1px solid var(--color-border)", borderRadius: 6, padding: "2px 6px",
          }}
        >
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k} style={{ color: "var(--color-text)" }}>{v.label}</option>
          ))}
        </select>
        {c.outcomePct != null && (
          <span className="mono" style={{ fontSize: 12, color: c.outcomePct >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
            {c.outcomePct >= 0 ? "+" : ""}{Math.round(c.outcomePct)}%
          </span>
        )}
      </div>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void | Promise<void> }) {
  const toast = useToast();
  const [ticker, setTicker] = useState("");
  const [thesisTrait, setThesisTrait] = useState("");
  const [direction, setDirection] = useState("bull");
  const [falsifier, setFalsifier] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!ticker.trim() || !thesisTrait.trim()) {
      toast.error("Ticker and thesis are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/convictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, thesisTrait, direction, falsifier }),
      });
      if (!res.ok) throw new Error();
      toast.success("Conviction added.");
      await onDone();
    } catch {
      toast.error("Couldn't save the conviction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8, marginBottom: 16,
      padding: 14, borderRadius: 10, background: "var(--color-bg)", border: "1px solid var(--color-border)",
    }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="Ticker" style={{ ...inputStyle, width: 96 }} />
        <select value={direction} onChange={(e) => setDirection(e.target.value)} style={inputStyle}>
          <option value="bull">Bull</option>
          <option value="bear">Bear</option>
          <option value="watching">Watching</option>
        </select>
        <input value={thesisTrait} onChange={(e) => setThesisTrait(e.target.value)} placeholder="Your thesis (e.g. post-hype reset)" style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
      </div>
      <input value={falsifier} onChange={(e) => setFalsifier(e.target.value)} placeholder="Wrong if… (the falsifier that changes your mind)" style={inputStyle} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="tbtn on" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save conviction"}</button>
      </div>
    </div>
  );
}
