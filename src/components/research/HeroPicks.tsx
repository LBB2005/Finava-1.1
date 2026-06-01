"use client";
import Link from "next/link";
import { type Pick } from "@/lib/research";
import { GradeBadge, Radar } from "./primitives";

/** A single horizon top-pick card: radar with the score centred, stats stacked below. */
function HeroPick({ pick }: { pick: Pick }) {
  const up = pick.chg >= 0;
  return (
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "13px 15px", flex: 1, minWidth: 0 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "#fff", background: "var(--color-accent)", padding: "2px 8px", borderRadius: 3 }}>
          {pick.horizon.tag} · {pick.horizon.label.toUpperCase()}
        </span>
        <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--color-muted)" }}>TOP PICK</span>
      </div>

      {/* Radar with score in the centre */}
      <div className="flex justify-center" style={{ position: "relative", margin: "2px 0 6px" }}>
        <Radar f={pick.f} size={150} scale={0.34} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
          <div className="serif" style={{ fontSize: 30, fontWeight: 800, color: "var(--color-accent)", lineHeight: 1 }}>{pick.score}</div>
          <div className="mono" style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: "var(--color-muted)" }}>SCORE</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between" style={{ paddingTop: 9, borderTop: "1px solid var(--color-border)" }}>
        <div className="min-w-0">
          <div className="flex items-center" style={{ gap: 7 }}>
            <Link href={`/stock/${pick.ticker}`} className="tklink">
              <span className="serif" style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1, color: "var(--color-text)" }}>{pick.ticker}</span>
            </Link>
            <GradeBadge grade={pick.grade} size="sm" />
          </div>
          <Link href={`/stock/${pick.ticker}`} className="tklink">
            <div className="truncate" style={{ fontSize: 10.5, color: "var(--color-muted)", marginTop: 3 }}>{pick.name}</div>
          </Link>
        </div>
        <div className="text-right flex-shrink-0" style={{ marginLeft: 8 }}>
          <div className="mono" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-text)" }}>{pick.price.toFixed(2)}</div>
          <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: up ? "var(--color-bull)" : "var(--color-bear)" }}>{up ? "▲ +" : "▼ "}{pick.chg}%</div>
        </div>
      </div>

      <p className="mono" style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--color-text-secondary)", marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--color-border)" }}>
        <span style={{ color: "var(--color-accent)", fontWeight: 700 }}>&gt; </span>
        {pick.take}
      </p>
    </div>
  );
}

export default function HeroPicks({ picks }: { picks: Pick[] }) {
  return (
    <div className="flex" style={{ gap: 12 }}>
      {picks.map((p) => (
        <HeroPick key={p.horizon.key} pick={p} />
      ))}
    </div>
  );
}
