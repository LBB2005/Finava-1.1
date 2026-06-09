"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ranked, HORIZONS, fmtPct1, type HorizonKey, type Stock } from "@/lib/research";
import { ArcGauge, GradeBadge } from "./primitives";

type MoverRow = Stock & { move: number };

/** One movers column — TOP GAINERS or TOP LAGGARDS. Scrolls to reveal the rest;
 *  each row carries a magnitude bar normalised to the column's largest move. */
function MoversColumn({ title, rows, up, mx, winTag }: { title: string; rows: MoverRow[]; up: boolean; mx: number; winTag: string }) {
  const color = up ? "var(--color-bull)" : "var(--color-bear)";
  return (
    <div className="bn-col">
      <div className="bn-col-head">
        <span className="mono bn-col-title" style={{ color }}>{up ? "▲ " : "▼ "}{title}</span>
        <span className="mono bn-col-count">{rows.length} names · {winTag}</span>
      </div>
      <div className="bn-scroll">
        {rows.map((s) => (
          <div key={s.ticker} className="bn-mv">
            <Link href={`/stock/${s.ticker}`} className="tklink mono mvb-tk">{s.ticker}</Link>
            <span className="mvb-name">{s.name}</span>
            <div className="mvb-track"><div className="mvb-fill" style={{ width: (Math.abs(s.move) / mx) * 100 + "%", background: color }} /></div>
            <span className="mono mvb-val" style={{ color }}>{fmtPct1(s.move)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The Banner board — a single strip across the top: the horizon's top pick with
 *  an arc gauge on the left, then scrollable Top Gainers / Top Laggards columns. */
export default function BannerBoard({ horizon, universe }: { horizon: HorizonKey; universe: Stock[] }) {
  const tag = HORIZONS.find((h) => h.key === horizon)?.tag ?? "1W";

  const feature = useMemo(() => ranked(horizon, universe)[0], [horizon, universe]);
  const { gainers, losers, mxG, mxL } = useMemo(() => {
    const all = universe.map((s) => ({ ...s, move: s.mv[horizon] }));
    const g = all.filter((s) => s.move >= 0).sort((a, b) => b.move - a.move);
    const l = all.filter((s) => s.move < 0).sort((a, b) => a.move - b.move);
    return {
      gainers: g,
      losers: l,
      mxG: Math.max(...g.map((s) => s.move), 1),
      mxL: Math.max(...l.map((s) => Math.abs(s.move)), 1),
    };
  }, [horizon, universe]);

  if (!feature) return null;
  const up = feature.chg >= 0;

  return (
    <div className="bn-hero">
      <div className="bn-feat">
        <ArcGauge score={feature.score} size={130} stroke={12} />
        <div className="feat-info">
          <span className="mono feat-tag">{tag} · TOP PICK</span>
          <div className="feat-idrow">
            <Link href={`/stock/${feature.ticker}`} className="tklink">
              <span className="serif feat-tk" style={{ fontSize: 34 }}>{feature.ticker}</span>
            </Link>
            <GradeBadge grade={feature.grade} size="md" />
          </div>
          <Link href={`/stock/${feature.ticker}`} className="tklink">
            <div className="feat-name truncate">{feature.name}</div>
          </Link>
          <div className="feat-pxrow">
            <span className="mono feat-px">{feature.price.toFixed(2)}</span>
            <span className="mono feat-chg" style={{ color: up ? "var(--color-bull)" : "var(--color-bear)" }}>
              {up ? "▲" : "▼"} {fmtPct1(feature.chg)}
            </span>
          </div>
        </div>
      </div>
      <div className="bn-movers">
        <MoversColumn title="TOP GAINERS" rows={gainers} up mx={mxG} winTag={tag} />
        <MoversColumn title="TOP LAGGARDS" rows={losers} up={false} mx={mxL} winTag={tag} />
      </div>
    </div>
  );
}
