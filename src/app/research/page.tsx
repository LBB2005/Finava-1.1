"use client";
import { useState, useMemo } from "react";
import { HORIZONS, overlayLive, ranked, UNIVERSE, type HorizonKey } from "@/lib/research";
import { useLiveBoard } from "@/hooks/useLiveBoard";
import { useFactorUniverse } from "@/hooks/useFactorUniverse";
import VerdictHero from "@/components/research/VerdictHero";
import BoardLeaderboard from "@/components/research/BoardLeaderboard";
import MoversRail from "@/components/research/MoversRail";
import TuneMode from "@/components/research/TuneMode";
import CompareMode from "@/components/research/CompareMode";
import ScreenMode from "@/components/research/ScreenMode";
import ThemesMode from "@/components/research/ThemesMode";
import SignalsMode from "@/components/research/SignalsMode";
import ChatContextButton from "@/components/chat/ChatContextButton";

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

  const feature = useMemo(() => ranked(horizon, universe)[0], [horizon, universe]);

  return (
    <div className="research-root term vB1 flex flex-col h-full overflow-hidden">
      {/* Seamless command bar — blends into the body, pill lens tabs + segmented
          horizon. No hard divider (the soft fade lives in the ::after). */}
      <div className="b-bar">
        <div className="b-bar-mast">
          <span className="serif b-bar-title">Research</span>
          <span className="mono b-bar-eyebrow">SCORE ENGINE</span>
        </div>

        <div className="b-lenses b-lenses-pill">
          {MODES.map((m) => (
            <button key={m.key} className={"b-lens" + (mode === m.key ? " on" : "")} onClick={() => setMode(m.key)}>{m.label}</button>
          ))}
        </div>

        <div className="b-bar-right">
          <div className="b-hzseg">
            {HORIZONS.map((h) => (
              <button key={h.key} className={"b-hzbtn" + (horizon === h.key ? " on" : "")} onClick={() => setHorizon(h.key)}>
                {h.tag}
              </button>
            ))}
          </div>
          <span className="mono b-asof">{asOfLabel}</span>
          <ChatContextButton context="research" />
        </div>
      </div>

      {/* Scrolling body — outer scroller stays a plain block so the inner
          flex column grows to its content height instead of shrink-clipping. */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarGutter: "stable both-edges" }}>
        <div style={{ padding: "8px 26px 150px", display: "flex", flexDirection: "column", gap: 18 }}>
          {mode === "board" && (
            <>
              {feature && <VerdictHero feature={feature} horizon={horizon} />}
              <div className="b-split">
                <BoardLeaderboard horizon={horizon} universe={universe} loading={isLoading} />
                <MoversRail horizon={horizon} universe={universe} />
              </div>
            </>
          )}

          {mode !== "board" && SECTION_RULE[mode] && (
            <div style={{ marginTop: 8 }}><SectionRule label={SECTION_RULE[mode]!} /></div>
          )}

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
