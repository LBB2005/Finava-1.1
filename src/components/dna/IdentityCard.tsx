"use client";
import { useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { useToast } from "@/hooks/useToast";
import type { InvestorDNA } from "@/types/dna";

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
      padding: "24px 28px",
      background: "linear-gradient(118deg, var(--color-accent-light), var(--color-bg) 72%)",
      boxShadow: "var(--shadow-card)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.16em", color: "var(--color-muted)",
        }}>What I see in you</span>
        <KnownnessMeter value={dna.knownness} />
      </div>

      <p className="serif" style={{
        fontSize: 25, lineHeight: 1.4, letterSpacing: "-0.01em",
        color: "var(--color-text)", margin: "14px 0 0", maxWidth: 700,
      }}>
        {dna.identityLine}
      </p>

      <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", margin: "10px 0 0" }}>
        Closest profile: <b style={{ color: "var(--color-text)" }}>{dna.archetype}</b>
        {" · "}nearest lens preset {dna.matchedPreset}
      </p>

      {verdict ? (
        <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 18 }}>
          {verdict === "confirmed" ? "✓ Noted — thanks for confirming." : "✓ Noted — I'll sharpen this as I learn more."}
        </p>
      ) : refining ? (
        <div style={{ display: "flex", gap: 8, marginTop: 18, maxWidth: 520 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did I get wrong?"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") send("refine", note); }}
            style={{
              flex: 1, fontSize: 13, padding: "8px 12px", borderRadius: 8,
              border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)",
            }}
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
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>
        <span>How well I know you</span>
        <span className="mono" style={{ color: "var(--color-text)", fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--color-surface)", overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: "var(--color-accent)", transition: "width 600ms ease" }} />
      </div>
    </div>
  );
}
