// Tier-colored Finava score pill, shared by the portfolio and watchlist tables.
export default function ScorePill({ score }: { score: number }) {
  const color =
    score >= 70 ? "var(--color-bull)"
    : score >= 60 ? "var(--color-warn)"
    : "var(--color-bear)";
  const bg =
    score >= 80 ? "color-mix(in oklab, var(--color-bull) 13%, transparent)"
    : score >= 70 ? "color-mix(in oklab, var(--color-bull) 8%, transparent)"
    : score >= 60 ? "color-mix(in oklab, var(--color-warn) 13%, transparent)"
    : "color-mix(in oklab, var(--color-bear) 15%, transparent)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 30, padding: "3px 8px", borderRadius: "var(--radius-xs)",
      fontSize: "var(--text-meta)", fontWeight: 700, color, background: bg,
      fontVariantNumeric: "tabular-nums",
    }}>{score}</span>
  );
}
