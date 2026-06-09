"use client";
import { useState, useMemo } from "react";
import { HORIZONS, overlayLive, UNIVERSE, type HorizonKey } from "@/lib/research";
import { useLiveBoard } from "@/hooks/useLiveBoard";
import { useFactorUniverse } from "@/hooks/useFactorUniverse";
import BannerBoard from "@/components/research/BannerBoard";
import Leaderboard from "@/components/research/Leaderboard";
import TuneMode from "@/components/research/TuneMode";
import CompareMode from "@/components/research/CompareMode";
import ScreenMode from "@/components/research/ScreenMode";
import ThemesMode from "@/components/research/ThemesMode";
import SignalsMode from "@/components/research/SignalsMode";

type Mode = "board" | "tune" | "compare" | "screen" | "themes" | "signals";

const MODES: { key: Mode; label: string }[] = [
  { key: "board", label: "BOARD" },
  { key: "tune", label: "TUNE" },
  { key: "compare", label: "COMPARE" },
  { key: "screen", label: "SCREEN" },
  { key: "themes", label: "THEMES" },
  { key: "signals", label: "SIGNALS" },
];

const SECTION_RULE: Partial<Record<Mode, string>> = {
  tune: "TUNE YOUR LENS · WEIGHT THE FACTORS, GET MATCHED",
  compare: "COMPARE · FACTOR HEAD-TO-HEAD WITH AN AI VERDICT",
  screen: "SCREEN · ASK IN PLAIN ENGLISH, MATCHED ON REAL FACTORS",
  themes: "THEMES · AI-BUILT BASKETS ACROSS THE S&P 500",
  signals: "SIGNALS · WHAT'S MOVING, NARRATED",
};

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

        {/* Lens toggle */}
        <div className="flex items-center" style={{ gap: 4, marginLeft: 6, flexWrap: "wrap" }}>
          {MODES.map((m) => (
            <button key={m.key} className={"tbtn" + (mode === m.key ? " on" : "")} onClick={() => setMode(m.key)}>{m.label}</button>
          ))}
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
          {mode === "board" && (
            <>
              <SectionRule label="TODAY ON THE BOARD · TOP PICK &amp; MOVERS" />
              <BannerBoard horizon={horizon} universe={universe} />

              <Leaderboard horizon={horizon} universe={universe} loading={isLoading} />
            </>
          )}

          {mode !== "board" && SECTION_RULE[mode] && <SectionRule label={SECTION_RULE[mode]!} />}

          {mode === "tune" && <TuneMode />}
          {mode === "compare" && <CompareMode universe={universe} loading={isLoading} />}
          {mode === "screen" && <ScreenMode universe={universe} loading={isLoading} />}
          {mode === "themes" && <ThemesMode universe={universe} />}
          {mode === "signals" && <SignalsMode universe={universe} loading={isLoading} />}
        </div>
      </div>
    </div>
  );
}
