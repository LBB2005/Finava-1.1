"use client";
import Link from "next/link";
import { movers, fmtPct1, type HorizonKey, type Mover, type Stock } from "@/lib/research";

function Side({ rows, up, win }: { rows: Mover[]; up: boolean; win: HorizonKey }) {
  return (
    <div style={{ flex: 1, minWidth: 0, border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden" }}>
      <div className="flex items-center justify-between" style={{ padding: "7px 12px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: up ? "var(--color-bull)" : "var(--color-bear)" }}>
          {up ? "▲ GAINERS" : "▼ LAGGARDS"}
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)" }}>{win.toUpperCase()} REALISED</span>
      </div>
      {rows.map((s) => (
        <div key={s.ticker} className="flex items-center justify-between mono" style={{ padding: "7px 12px", fontSize: 12, borderBottom: "1px solid var(--color-border)" }}>
          <Link href={`/stock/${s.ticker}`} className="tklink flex items-center" style={{ gap: 8, minWidth: 0 }}>
            <span style={{ fontWeight: 700, color: "var(--color-accent)" }}>{s.ticker}</span>
            <span className="truncate" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>{s.name}</span>
          </Link>
          <span style={{ fontWeight: 600, color: up ? "var(--color-bull)" : "var(--color-bear)" }}>{fmtPct1(s.move)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Movers({ window: win, universe }: { window: HorizonKey; universe?: Stock[] }) {
  const { gainers, losers } = movers(win, universe);
  return (
    <div className="flex" style={{ gap: 12 }}>
      <Side rows={gainers} up win={win} />
      <Side rows={losers} up={false} win={win} />
    </div>
  );
}
