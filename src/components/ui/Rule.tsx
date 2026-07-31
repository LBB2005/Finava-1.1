/**
 * Rule — the eyebrow-divider used to open every ruled section: a micro
 * uppercase label followed by a hairline that fills the remaining width.
 * One implementation for the stock surfaces (and anywhere else it drops in);
 * the optional `right` slot renders trailing meta (counts, streaming badges).
 */
export default function Rule({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px" }}>
      <span className="mono eyebrow-label" style={{ color: "var(--color-muted)" }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
      {right}
    </div>
  );
}
