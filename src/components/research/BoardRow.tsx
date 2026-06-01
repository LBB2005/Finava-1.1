"use client";
import { useRouter } from "next/navigation";
import { fmtPct1, fmtMktCap, fmtPE, fmtVol, fmtRvol, type RankedStock } from "@/lib/research";
import { GradeBadge } from "./primitives";

const muted = { color: "var(--color-muted)" };

/**
 * One leaderboard row. Data-dense and clickable — the whole row navigates to the
 * stock's detail page (where the factor profile now lives). Market-data cells
 * show "—" until the live feed resolves, never a stale seed price.
 */
export default function BoardRow({ s, highlight = false }: { s: RankedStock; highlight?: boolean }) {
  const router = useRouter();
  const href = `/stock/${s.ticker}`;
  const up = s.chg >= 0;
  const live = s.live === true;

  return (
    <tr
      className={"board-row" + (highlight ? " top3" : "")}
      onClick={() => router.push(href)}
      onMouseEnter={() => router.prefetch(href)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      <td className="mono" style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: highlight ? "var(--color-accent)" : "var(--color-muted)" }}>
        {String(s.rank).padStart(2, "0")}
      </td>

      <td style={{ textAlign: "left" }}>
        <span className="tk" style={{ fontSize: 13 }}>{s.ticker}</span>
        <span className="lad-name" style={{ fontSize: 10.5, color: "var(--color-muted)", marginLeft: 8 }}>{s.name}</span>
      </td>

      {/* Last */}
      <td className="mono num" style={{ fontSize: 12, color: "var(--color-text)" }}>
        {live ? s.price.toFixed(2) : <span style={muted}>—</span>}
      </td>

      {/* Change */}
      <td className="mono num" style={{ fontSize: 12, fontWeight: 600, color: live ? (up ? "var(--color-bull)" : "var(--color-bear)") : "var(--color-muted)" }}>
        {live ? fmtPct1(s.chg) : "—"}
      </td>

      {/* Market cap */}
      <td className="mono num" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
        {fmtMktCap(s.marketCap)}
      </td>

      {/* P/E */}
      <td className="mono num" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
        {fmtPE(s.pe)}
      </td>

      {/* Avg volume (10-day, consolidated) */}
      <td className="mono num" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
        {fmtVol(s.avgVol)}
      </td>

      {/* Relative volume */}
      <td className="mono num" style={{ fontSize: 12, fontWeight: 600, color: s.rvol != null && s.rvol >= 1.5 ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
        {fmtRvol(s.rvol)}
      </td>

      {/* Lucra Score — its column absorbs the table's slack; cap the bar so it
          stays a tidy meter rather than stretching the full width. */}
      <td>
        <div className="flex items-center" style={{ gap: 9, maxWidth: 300 }}>
          <div className="fbar-track" style={{ flex: 1, height: 7 }}>
            <div className="fbar-fill" style={{ width: s.score + "%", height: "100%", background: "var(--color-accent)" }} />
          </div>
          <span className="serif" style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text)", width: 24, textAlign: "right" }}>{s.score}</span>
        </div>
      </td>

      {/* Grade */}
      <td style={{ textAlign: "center" }}><div className="flex justify-center"><GradeBadge grade={s.grade} size="sm" /></div></td>
    </tr>
  );
}
