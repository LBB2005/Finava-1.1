"use client";
import { useEffect } from "react";
import { useMoneyMap } from "@/hooks/useMoneyMap";
import MoneyMapGraph from "@/components/stock/MoneyMapGraph";
import MoneyFlowList from "@/components/stock/MoneyFlowList";

function Rule({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
      <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)" }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
      {right}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color }} />
      <span style={{ fontSize: 10.5, color: "var(--color-text-secondary)" }}>{label}</span>
    </span>
  );
}

export function MoneyMapTab({ ticker }: { ticker: string }) {
  const { status, map, error, run, retry } = useMoneyMap(ticker);

  // Tab click mounts this component — fire the run (no-op if already cached).
  useEffect(() => {
    run();
  }, [run]);

  const { self, relations } = map;
  const streaming = status === "streaming";

  if (status === "error" && relations.length === 0) {
    return (
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
        <p style={{ fontSize: 13, color: "var(--color-bear)" }}>{error ?? "Couldn't build the money map."}</p>
        <button className="tbtn on" onClick={retry}>RETRY</button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <Rule right={
        streaming ? (
          <span className="mono" style={{ fontSize: 9.5, color: "var(--color-muted)", letterSpacing: "0.05em" }}>MAPPING…</span>
        ) : (
          <span className="mono" style={{ fontSize: 9.5, color: "var(--color-muted)" }}>{relations.length} linked</span>
        )
      }>
        Money Map · who funds {ticker} & who it pays
      </Rule>

      {/* graph — hidden on narrow screens, where the ranked flows list below is
          the readable fallback (a radial web is too dense at phone widths) */}
      <div className="hidden md:block">
        {self ? (
          <MoneyMapGraph self={self} relations={relations} />
        ) : (
          <div className="skeleton" style={{ width: "100%", height: 300, borderRadius: 12 }} />
        )}
      </div>

      {/* legend */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, margin: "10px 2px 0", paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
        <LegendDot color="var(--color-bull)" label="Customers · in" />
        <LegendDot color="var(--color-warn)" label="Suppliers · out" />
        <LegendDot color="var(--color-accent)" label="Owners" />
        <LegendDot color="var(--color-muted)" label="Peers" />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="var(--color-text-secondary)" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" /></svg>
          <span style={{ fontSize: 10.5, color: "var(--color-text-secondary)" }}>AI-estimated</span>
        </span>
      </div>

      {/* flows list */}
      <div style={{ marginTop: 20 }}>
        <Rule>Flows · ranked by money intensity</Rule>
        {relations.length > 0 ? (
          <MoneyFlowList relations={relations} />
        ) : streaming ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 22, borderRadius: 6 }} />
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>No relationships found for this company.</p>
        )}
      </div>

      <p className="mono" style={{ margin: "16px 0 0", fontSize: 10.5, color: "var(--color-muted)", lineHeight: 1.5 }}>
        Owners &amp; peers are live data (Finnhub). Suppliers &amp; customers are AI-estimated from the latest SEC 10-K — directional, may contain errors, not audit-grade. Research color, not investment advice.
      </p>
    </div>
  );
}
