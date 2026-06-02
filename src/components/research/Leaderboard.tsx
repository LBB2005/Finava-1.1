"use client";
import { useState, useMemo } from "react";
import { ranked, type HorizonKey, type RankedStock, type Stock } from "@/lib/research";
import BoardRow from "./BoardRow";

type SortKey = "rank" | "ticker" | "price" | "chg" | "marketCap" | "pe" | "avgVol" | "rvol" | "score";

function sortVal(s: RankedStock, key: SortKey): number {
  switch (key) {
    case "price": return s.price;
    case "chg": return s.chg;
    // Missing fundamentals sort to the bottom rather than masquerading as 0.
    case "marketCap": return s.marketCap ?? -Infinity;
    case "pe": return s.pe ?? -Infinity;
    case "avgVol": return s.avgVol ?? -Infinity;
    case "rvol": return s.rvol ?? -Infinity;
    case "score": return s.score;
    default: return s.rank;
  }
}

export default function Leaderboard({
  horizon,
  universe = [],
  loading = false,
}: {
  horizon: HorizonKey;
  universe?: Stock[];
  loading?: boolean;
}) {
  const [sector, setSector] = useState("All");
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: "rank", dir: 1 });

  // Derive sectors from whatever universe is passed — works for both the 72-name
  // seed fallback and the full 503-name real universe.
  const sectors = useMemo(
    () => Array.from(new Set(universe.map((s) => s.sector))).sort(),
    [universe]
  );

  const rows = useMemo(() => {
    let r = ranked(horizon, universe);
    if (sector !== "All") r = r.filter((s) => s.sector === sector);
    const { key, dir } = sort;
    r = [...r].sort((a, b) => {
      if (key === "ticker") return dir * a.ticker.localeCompare(b.ticker);
      return dir * (sortVal(a, key) - sortVal(b, key));
    });
    return r;
  }, [horizon, universe, sector, sort]);

  const th = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === "rank" || key === "ticker" ? 1 : -1 }));
  const ar = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}>
      <div className="flex items-center justify-between" style={{ padding: "9px 14px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div className="flex items-center" style={{ gap: 9 }}>
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--color-text)" }}>LEADERBOARD</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>
            {rows.length} / {universe.length} · weighted {horizon.toUpperCase()}
          </span>
          <span className="mono board-live" style={{ fontSize: 10, letterSpacing: "0.06em", color: loading ? "var(--color-muted)" : "var(--color-bull)" }}>
            {loading ? "○ SYNCING" : "● LIVE"}
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.1em" }}>SECTOR</span>
          <select className="tsel" value={sector} onChange={(e) => setSector(e.target.value)}>
            {["All", ...sectors].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="lad-table board-table" style={{ minWidth: 980 }}>
          <thead>
            {/* Every column is fixed-width except Lucra Score, so the left
                cluster (#/ticker/price/fundamentals) stays tight and the score
                bar — the app's headline metric — absorbs the slack. */}
            <tr>
              <th onClick={() => th("rank")} style={{ textAlign: "left", width: 40 }}>#{ar("rank")}</th>
              <th onClick={() => th("ticker")} style={{ textAlign: "left", width: 188 }}>Ticker{ar("ticker")}</th>
              <th onClick={() => th("price")} className="num" style={{ width: 82 }}>Last{ar("price")}</th>
              <th onClick={() => th("chg")} className="num" style={{ width: 72 }}>Chg{ar("chg")}</th>
              <th onClick={() => th("marketCap")} className="num" style={{ width: 94 }}>Mkt Cap{ar("marketCap")}</th>
              <th onClick={() => th("pe")} className="num" style={{ width: 62 }}>P/E{ar("pe")}</th>
              <th onClick={() => th("avgVol")} className="num" style={{ width: 86 }}>Avg Vol{ar("avgVol")}</th>
              <th onClick={() => th("rvol")} className="num" style={{ width: 72 }}>RVOL{ar("rvol")}</th>
              <th onClick={() => th("score")} style={{ textAlign: "left", minWidth: 160 }}>Lucra Score{ar("score")}</th>
              <th style={{ textAlign: "center", width: 54 }}>Grd</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <BoardRow key={s.ticker} s={s} highlight={s.rank <= 3 && sort.key === "rank"} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
