import { Card } from "./DnaPrimitives";
import type { TraitRecord as TraitRecordType } from "@/types/dna";

const signed = (n: number) => (n >= 0 ? "+" : "") + Math.round(n) + "%";

/**
 * Per-factor real track record from the user's holdings — semantic label on top,
 * hard P&L underneath. Bar length encodes the magnitude of the edge/loss; colour
 * encodes direction; thin samples render faded (never a confident edge).
 */
export default function TraitRecord({ traits }: { traits: TraitRecordType[] }) {
  if (traits.length === 0) return null;
  const maxAbs = Math.max(...traits.map((t) => Math.abs(t.avgReturnPct)), 1);

  return (
    <Card title="Where you have an edge — and where you don't">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {traits.map((t) => {
          const pos = t.avgReturnPct > 0;
          const neg = t.avgReturnPct < 0;
          const color = pos ? "var(--color-bull)" : neg ? "var(--color-bear)" : "var(--color-muted)";
          const width = Math.max((Math.abs(t.avgReturnPct) / maxAbs) * 100, 4);
          const faded = t.sample === "thin";

          return (
            <div key={t.factor} style={{ opacity: faded ? 0.62 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text)" }}>
                  {t.label}
                  <span className="mono" style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", marginLeft: 8 }}>
                    {t.exposurePct}% of book{faded ? " · thin" : ""}
                  </span>
                </span>
                <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                  <b style={{ color, fontWeight: 700 }}>{signed(t.avgReturnPct)}</b> · {t.hits}/{t.total}
                </span>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: "var(--color-surface)", overflow: "hidden" }}>
                <div style={{ width: `${width}%`, height: "100%", background: color }} />
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", marginTop: 14, lineHeight: 1.5 }}>
        Real returns on your own holdings, grouped by trait. Green = your edge · red = blind spot · faded = still learning.
      </p>
    </Card>
  );
}
