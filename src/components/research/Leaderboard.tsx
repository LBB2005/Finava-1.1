"use client";
import { useState, useMemo } from "react";
import { FACTORS, SECTORS, UNIVERSE, ranked, type FactorKey, type HorizonKey } from "@/lib/research";
import LadderRow from "./LadderRow";

type SortKey = "rank" | "ticker" | "price" | "chg" | "score";
const FACTOR_KEYS = new Set<string>(FACTORS.map((f) => f.key));

export default function Leaderboard({ horizon }: { horizon: HorizonKey }) {
  const [sector, setSector] = useState("All");
  const [sort, setSort] = useState<{ key: string; dir: number }>({ key: "rank", dir: 1 });

  const rows = useMemo(() => {
    let r = ranked(horizon);
    if (sector !== "All") r = r.filter((s) => s.sector === sector);
    const { key, dir } = sort;
    r = [...r].sort((a, b) => {
      if (key === "ticker") return dir * a.ticker.localeCompare(b.ticker);
      const av = FACTOR_KEYS.has(key) ? a.f[key as FactorKey] : (a[key as keyof typeof a] as number);
      const bv = FACTOR_KEYS.has(key) ? b.f[key as FactorKey] : (b[key as keyof typeof b] as number);
      return dir * (av - bv);
    });
    return r;
  }, [horizon, sector, sort]);

  const th = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === "rank" || key === "ticker" ? 1 : -1 }));
  const ar = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : "");

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}>
      <div className="flex items-center justify-between" style={{ padding: "9px 14px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div className="flex items-center" style={{ gap: 9 }}>
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--color-text)" }}>LEADERBOARD</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>
            {rows.length} / {UNIVERSE.length} · weighted {horizon.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.1em" }}>SECTOR</span>
          <select className="tsel" value={sector} onChange={(e) => setSector(e.target.value)}>
            {["All", ...SECTORS].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="lad-table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th onClick={() => th("rank")} style={{ textAlign: "left", width: 42 }}>#{ar("rank")}</th>
              <th onClick={() => th("ticker")} style={{ textAlign: "left" }}>Ticker {ar("ticker")}</th>
              <th onClick={() => th("price")} style={{ textAlign: "right" }}>Last {ar("price")}</th>
              <th onClick={() => th("chg")} style={{ textAlign: "right" }}>Chg {ar("chg")}</th>
              <th style={{ textAlign: "center", width: 150 }}>Factor profile</th>
              <th onClick={() => th("score")} style={{ textAlign: "left", width: 150 }}>Lucra Score {ar("score")}</th>
              <th style={{ textAlign: "center", width: 52 }}>Grd</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <LadderRow key={s.ticker} s={s} highlight={s.rank <= 3 && sort.key === "rank"} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
