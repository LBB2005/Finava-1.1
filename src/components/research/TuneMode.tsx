"use client";
import { useState, useMemo } from "react";
import {
  FACTORS,
  NEUTRAL_WEIGHTS,
  TUNE_PRESETS,
  normalizedWeights,
  rankByWeights,
  factorColor,
  type FactorScores,
} from "@/lib/research";
import { useFactorUniverse } from "@/hooks/useFactorUniverse";
import WeightRadar from "./WeightRadar";
import LadderRow from "./LadderRow";
import { LensErrorState } from "./primitives";

const sameWeights = (a: FactorScores, b: FactorScores) => FACTORS.every((f) => a[f.key] === b[f.key]);
const DEFAULT_VISIBLE = 25;

export default function TuneMode() {
  const { universe, coverage, isLoading, error, retry } = useFactorUniverse();

  const [weights, setWeights] = useState<FactorScores>(NEUTRAL_WEIGHTS);
  // The weighting the user last ran (null until they hit the button).
  const [applied, setApplied] = useState<FactorScores | null>(null);
  const [showAll, setShowAll] = useState(false);

  const norm = normalizedWeights(weights);
  const activePreset = TUNE_PRESETS.find((p) => sameWeights(p.weights, weights))?.key ?? null;

  // Re-ranks automatically when either the applied weighting OR the universe
  // changes — so results appear as soon as the scored universe finishes loading,
  // even if the user clicked "find matches" first.
  const results = useMemo(
    () => (applied && universe ? rankByWeights(applied, universe) : null),
    [applied, universe]
  );

  const dirty = applied != null && !sameWeights(applied, weights);
  const ranButWaiting = applied != null && !universe;
  const total = coverage?.total ?? universe?.length ?? 0;
  const visible = showAll ? results?.length ?? 0 : DEFAULT_VISIBLE;

  function findMatches() {
    setApplied(weights);
    setShowAll(false);
  }

  return (
    <div className="flex" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      {/* ── Control panel ───────────────────────────────────────── */}
      <div style={{ flex: "1 1 340px", minWidth: 300, maxWidth: 440, border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}>
        <div className="flex items-center justify-between" style={{ padding: "9px 14px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--color-text)" }}>YOUR LENS</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.08em" }}>DRAG TO WEIGHT</span>
        </div>

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="flex justify-center">
            <WeightRadar weights={weights} onChange={setWeights} size={250} />
          </div>

          {/* Presets */}
          <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
            {TUNE_PRESETS.map((p) => (
              <button
                key={p.key}
                className={"tbtn" + (activePreset === p.key ? " on" : "")}
                onClick={() => setWeights(p.weights)}
              >
                {p.label}
              </button>
            ))}
            <button className="tbtn" onClick={() => setWeights(NEUTRAL_WEIGHTS)}>Reset</button>
          </div>

          {/* Weight readout (normalised %) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
            {FACTORS.map((fc) => (
              <div key={fc.key} className="flex items-center" style={{ gap: 10, fontSize: 11.5 }}>
                <span className="mono" style={{ width: 34, color: "var(--color-muted)", fontWeight: 700, flexShrink: 0 }}>{fc.short}</span>
                <span style={{ flex: "0 0 96px", color: "var(--color-text-secondary)" }}>{fc.full}</span>
                <div className="fbar-track" style={{ flex: 1, height: 6 }}>
                  <div className="fbar-fill" style={{ width: norm[fc.key] + "%", height: "100%", background: factorColor(weights[fc.key]) }} />
                </div>
                <span className="mono" style={{ width: 30, textAlign: "right", fontWeight: 600, color: "var(--color-text)" }}>{norm[fc.key]}%</span>
              </div>
            ))}
          </div>

          <button
            onClick={findMatches}
            disabled={!universe}
            className="mono"
            style={{
              width: "100%", padding: "10px 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
              color: "#fff", background: universe ? "var(--color-accent)" : "var(--color-muted)",
              border: "1px solid " + (universe ? "var(--color-accent)" : "var(--color-muted)"),
              borderRadius: 4, cursor: universe ? "pointer" : "default",
            }}
          >
            {!universe
              ? (error ? "DATA UNAVAILABLE" : "LOADING S&P 500 …")
              : applied == null ? "FIND MY MATCHES →" : dirty ? "UPDATE MATCHES →" : "REFRESH MATCHES →"}
          </button>

          {universe && (
            <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", textAlign: "center", letterSpacing: "0.04em" }}>
              {`scanning ${total} S&P 500 names · real factor data`}
            </span>
          )}
        </div>
      </div>

      {/* ── Results ─────────────────────────────────────────────── */}
      <div style={{ flex: "1 1 480px", minWidth: 320, border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}>
        <div className="flex items-center justify-between" style={{ padding: "9px 14px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
          <div className="flex items-center" style={{ gap: 9 }}>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--color-text)" }}>YOUR MATCHES</span>
            {results && (
              <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>
                {showAll ? `all ${results.length}` : `top ${Math.min(DEFAULT_VISIBLE, results.length)} of ${results.length}`} · weighted MY LENS
              </span>
            )}
          </div>
          {dirty && <span className="mono" style={{ fontSize: 10, color: "var(--color-warn)", letterSpacing: "0.04em" }}>● lens changed</span>}
        </div>

        {error && !universe ? (
          <LensErrorState
            title="Couldn't load the scored S&P 500."
            detail="The factor data didn't come back — retry in a moment."
            onRetry={retry}
            minHeight={320}
          />
        ) : results == null ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 320, padding: 24, textAlign: "center", gap: 8 }}>
            {ranButWaiting || isLoading ? (
              <>
                <div className="spin" style={{ width: 28, height: 28, border: "2.5px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%" }} />
                <p style={{ fontSize: 12, color: "var(--color-muted)", maxWidth: 320, lineHeight: 1.5 }}>
                  Scoring the S&amp;P 500 on real fundamentals, price and analyst data…
                </p>
              </>
            ) : (
              <>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><path d="M8 11h6M11 8v6" />
                </svg>
                <p className="serif" style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>Shape your lens, then find matches</p>
                <p style={{ fontSize: 12, color: "var(--color-muted)", maxWidth: 320, lineHeight: 1.5 }}>
                  Drag the radar to weight the six factors however you invest — or pick a preset — then run it against the whole S&amp;P 500.
                </p>
              </>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="lad-table" style={{ minWidth: 620, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", width: 36 }}>#</th>
                  <th style={{ textAlign: "left", width: 160 }}>Ticker</th>
                  <th style={{ textAlign: "right", width: 68 }}>Last</th>
                  <th style={{ textAlign: "right", width: 60 }}>Chg</th>
                  <th style={{ textAlign: "center", width: 132 }}>Factor profile</th>
                  <th style={{ textAlign: "left" }}>Match score</th>
                  <th style={{ textAlign: "center", width: 48 }}>Grd</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, visible).map((s) => (
                  <LadderRow key={s.ticker} s={s} highlight={s.rank <= 3} />
                ))}
              </tbody>
            </table>

            {results.length > DEFAULT_VISIBLE && (
              <div className="flex justify-center" style={{ padding: "10px 0", borderTop: "1px solid var(--color-border)" }}>
                <button className="tbtn" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show top 25" : `Show all ${results.length} →`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
