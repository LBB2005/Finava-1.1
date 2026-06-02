"use client";
import { useState, useMemo } from "react";
import { HORIZONS, topPicks, overlayLive, UNIVERSE, AS_OF, type HorizonKey } from "@/lib/research";
import { useLiveBoard } from "@/hooks/useLiveBoard";
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

export default function ResearchPage() {
  const [mode, setMode] = useState<Mode>("board");
  const [horizon, setHorizon] = useState<HorizonKey>("week");

  // Live market data overlaid on the seed universe — real price/% change plus
  // market cap, P/E and volume. Scores/grades are untouched (factor-derived).
  const tickers = useMemo(() => UNIVERSE.map((s) => s.ticker), []);
  const { liveMap, isLoading } = useLiveBoard(tickers);
  const universe = useMemo(() => overlayLive(UNIVERSE, liveMap), [liveMap]);
  const picks = useMemo(() => topPicks(universe), [universe]);

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
        <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>{AS_OF}</span>
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
