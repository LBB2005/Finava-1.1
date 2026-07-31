"use client";
import { useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { useToast } from "@/hooks/useToast";
import type { InvestorDNA } from "@/types/dna";

/** Small inline check glyph (replaces the "✓" character). */
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/**
 * The hero of the room — Finava's one-sentence read of the user, with the
 * "how well I know you" meter and the confirm/refine buttons whose every click
 * is a clean correction label for the ML moat.
 */
export default function IdentityCard({ dna }: { dna: InvestorDNA }) {
  const toast = useToast();
  const [verdict, setVerdict] = useState<"confirmed" | "refine" | null>(null);
  const [refining, setRefining] = useState(false);
  const [note, setNote] = useState("");

  async function send(v: "confirmed" | "refine", n = "") {
    setVerdict(v);
    try {
      await authFetch("/api/dna", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict: v, note: n }),
      });
      toast.success(v === "confirmed" ? "Glad it lands — I'll keep sharpening." : "Thanks — I'll factor that in.");
    } catch {
      toast.error("Couldn't save that. Try again.");
      setVerdict(null);
    }
  }

  return (
    <div style={{
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-xl)",
      padding: "20px 24px",
      background: "linear-gradient(118deg, var(--color-accent-light), var(--color-bg) 72%)",
      boxShadow: "var(--shadow-card)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <span className="eyebrow-label" style={{ color: "var(--color-muted)" }}>What I see in you</span>
        <KnownnessMeter value={dna.knownness} />
      </div>

      <p className="serif" style={{
        fontSize: "var(--text-stat)", lineHeight: 1.4, letterSpacing: "-0.01em",
        color: "var(--color-text)", margin: "14px 0 0", maxWidth: 700,
      }}>
        {dna.identityLine}
      </p>

      <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", margin: "10px 0 0" }}>
        Closest profile: <b style={{ color: "var(--color-text)" }}>{dna.archetype}</b>
        {" · "}nearest lens preset {dna.matchedPreset}
      </p>

      {verdict ? (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", marginTop: 18, display: "flex", alignItems: "center", gap: 5 }}>
          <CheckIcon />
          {verdict === "confirmed" ? "Noted — thanks for confirming." : "Noted — I'll sharpen this as I learn more."}
        </p>
      ) : refining ? (
        <div style={{ display: "flex", gap: 8, marginTop: 18, maxWidth: 520 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did I get wrong?"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") send("refine", note); }}
            className="input"
            style={{ flex: 1, padding: "8px 12px" }}
          />
          <button className="tbtn on" onClick={() => send("refine", note)}>Send</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button className="tbtn on" onClick={() => send("confirmed")}>This is me</button>
          <button className="tbtn" onClick={() => setRefining(true)}>Not quite — refine</button>
        </div>
      )}
    </div>
  );
}

function KnownnessMeter({ value }: { value: number }) {
  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-meta)", color: "var(--color-text-secondary)", marginBottom: 6 }}>
        <span>How well I know you</span>
        <span className="mono" style={{ color: "var(--color-text)", fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--color-surface)", overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: "var(--color-accent)", transition: "width 600ms ease" }} />
      </div>
    </div>
  );
}
