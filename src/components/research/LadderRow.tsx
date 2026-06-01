"use client";
import Link from "next/link";
import { type RankedStock } from "@/lib/research";
import { GradeBadge, MiniBars } from "./primitives";

/** One leaderboard / match row — shared by the Board and the Tune results table. */
export default function LadderRow({ s, highlight = false }: { s: RankedStock; highlight?: boolean }) {
  return (
    <tr className={highlight ? "top3" : ""}>
      <td className="mono" style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: highlight ? "var(--color-accent)" : "var(--color-muted)" }}>
        {String(s.rank).padStart(2, "0")}
      </td>
      <td style={{ textAlign: "left" }}>
        <Link href={`/stock/${s.ticker}`} className="tklink">
          <span className="tk" style={{ fontSize: 13 }}>{s.ticker}</span>
          <span style={{ fontSize: 10.5, color: "var(--color-muted)", marginLeft: 8 }}>{s.name}</span>
        </Link>
      </td>
      <td className="mono" style={{ textAlign: "right", fontSize: 12, color: "var(--color-text)" }}>{s.price.toFixed(2)}</td>
      <td className="mono" style={{ textAlign: "right", fontSize: 12, fontWeight: 600, color: s.chg >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
        {s.chg >= 0 ? "+" : ""}{s.chg}
      </td>
      <td><div className="flex justify-center"><MiniBars f={s.f} /></div></td>
      <td>
        <div className="flex items-center" style={{ gap: 9 }}>
          <div className="fbar-track" style={{ flex: 1, height: 7 }}>
            <div className="fbar-fill" style={{ width: s.score + "%", height: "100%", background: "var(--color-accent)" }} />
          </div>
          <span className="serif" style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text)", width: 24, textAlign: "right" }}>{s.score}</span>
        </div>
      </td>
      <td style={{ textAlign: "center" }}><div className="flex justify-center"><GradeBadge grade={s.grade} size="sm" /></div></td>
    </tr>
  );
}
