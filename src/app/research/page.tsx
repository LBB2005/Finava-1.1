"use client";
import { useState, useMemo } from "react";
import { HORIZONS, topPicks, overlayLive, UNIVERSE, type HorizonKey } from "@/lib/research";
import { useLiveBoard } from "@/hooks/useLiveBoard";
import { useFactorUniverse } from "@/hooks/useFactorUniverse";
import HeroPicks from "@/components/research/HeroPicks";
import Leaderboard from "@/components/research/Leaderboard";
import Movers from "@/components/research/Movers";
import TuneMode from "@/components/research/TuneMode";

type Mode = "board" | "tune";

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--color-muted)" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
    </div>
  );
}

/** Format asOf ISO string → "Jun 2, 2026 · 9:30 AM ET" */
function fmtAsOf(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    }) + " ET";
  } catch {
    return iso;
  }
}

export default function ResearchPage() {
  const [mode, setMode] = useState<Mode>("board");
  const [horizon, setHorizon] = useState<HorizonKey>("week");

  // Real factor universe (S&P 500, scored on real data). Falls back to the
  // 72-name seed so the Board renders immediately while the API call settles.
  const { universe: factorUniverse, isLoading: factorsLoading, asOf } = useFactorUniverse();
  const baseUniverse = factorUniverse ?? UNIVERSE;

  // Live market overlay — price, % change, market cap, P/E, volume.
  // Re-keys to 503 tickers once the factor universe arrives.
  const tickers = useMemo(() => baseUniverse.map((s) => s.ticker), [baseUniverse]);
  const { liveMap, isLoading: pricesLoading } = useLiveBoard(tickers);
  const universe = useMemo(() => overlayLive(baseUniverse, liveMap), [baseUniverse, liveMap]);
  const picks = useMemo(() => topPicks(universe), [universe]);

  const isLoading = pricesLoading || factorsLoading;
  const asOfLabel = asOf ? fmtAsOf(asOf) : "Loading…";

  return (
    <div className="research-root term flex flex-col h-full overflow-hidden">
      {/* Command bar */}
      <div className="cmdbar flex items-center flex-shrink-0" style={{ padding: "11px 22px", gap: 16, flexWrap: "wrap" }}>
        <div className="flex items-baseline" style={{ gap: 10 }}>
          <span className="serif" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)" }}>Research</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)", letterSpacing: "0.04em" }}>S&amp;P 500 · LUCRA SCORE ENGINE</span>
        </div>

        {/* Board / Tune mode toggle */}
        <div className="flex items-center" style={{ gap: 4, marginLeft: 6 }}>
          <button className={"tbtn" + (mode === "board" ? " on" : "")} onClick={() => setMode("board")}>BOARD</button>
          <button className={"tbtn" + (mode === "tune" ? " on" : "")} onClick={() => setMode("tune")}>TUNE</button>
        </div>

        <div className="flex items-center" style={{ gap: 7, marginLeft: "auto" }}>
          {mode === "board" && (
            <>
              <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.1em", marginRight: 2 }}>HORIZON</span>
              {HORIZONS.map((h) => (
                <button key={h.key} className={"tbtn" + (horizon === h.key ? " on" : "")} onClick={() => setHorizon(h.key)}>
                  {h.tag}
                </button>
              ))}
            </>
          )}
        </div>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>{asOfLabel}</span>
      </div>

      {/* Scrolling body — outer scroller stays a plain block so the inner
          flex column grows to its content height instead of shrink-clipping. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {mode === "board" ? (
            <>
              <SectionRule label="FORWARD PICKS · FACTOR PROFILE BY HORIZON" />
              <HeroPicks picks={picks} />

              <Leaderboard horizon={horizon} universe={universe} loading={isLoading} />

              <SectionRule label="TOP PERFORMERS · BACKWARD-LOOKING" />
              <Movers window={horizon} universe={universe} />
            </>
          ) : (
            <>
              <SectionRule label="TUNE YOUR LENS · WEIGHT THE FACTORS, GET MATCHED" />
              <TuneMode />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
