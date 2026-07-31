import type { Tendency } from "@/types/dna";

/** Small cards for the behavioural reads we can honestly derive (concentration, tilt). */
export default function Tendencies({ tendencies }: { tendencies: Tendency[] }) {
  if (tendencies.length === 0) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
      {tendencies.map((t) => (
        <div key={t.key} style={{
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 18px",
          background: "var(--color-surface)",
        }}>
          <div className="eyebrow-label" style={{ color: "var(--color-muted)", marginBottom: 8 }}>{t.label}</div>
          <div className="mono" style={{ fontSize: "var(--text-body)", color: "var(--color-text)", lineHeight: 1.45 }}>{t.detail}</div>
        </div>
      ))}
    </div>
  );
}
