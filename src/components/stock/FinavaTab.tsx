"use client";
import { useEffect, useState } from "react";
import { useFinava } from "@/hooks/useFinava";
import { useQuotes } from "@/hooks/useQuotes";
import {
  SIGNAL_ORDER,
  SIGNAL_LABELS,
  type FinavaFactor,
  type FinavaSignal,
  type Stance,
  type SignalKey,
} from "@/lib/finava";

/* ── tokens / helpers ─────────────────────────────────────────────────────── */
function stanceColor(stance: Stance): string {
  if (stance === "bullish") return "var(--color-bull)";
  if (stance === "bearish") return "var(--color-bear)";
  return "var(--color-warn)";
}
function fmtMoney(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n)
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}
function signedPct(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
      <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)" }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
    </div>
  );
}

/* ── score ring (left panel) ──────────────────────────────────────────────── */
function ScoreRing({ score, color, pending }: { score: number | null; color: string; pending: boolean }) {
  const pct = score ?? 0;
  const bg = pending
    ? "conic-gradient(var(--color-border-strong) 0% 25%, var(--color-surface-2) 25% 100%)"
    : `conic-gradient(${color} 0% ${pct}%, var(--color-surface-2) ${pct}% 100%)`;
  return (
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.6s ease",
        animation: pending ? "finavaPulse 1.4s ease-in-out infinite" : undefined,
      }}
    >
      <div style={{ width: 74, height: 74, background: "var(--color-bg)", borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {pending ? (
          <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.08em" }}>···</span>
        ) : (
          <>
            <span className="serif" style={{ fontSize: 26, fontWeight: 800, color: "var(--color-text)", lineHeight: 1 }}>{score}</span>
            <span className="mono" style={{ fontSize: 8, color: "var(--color-muted)", letterSpacing: "0.08em", marginTop: 2 }}>/ 100</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── factor breakdown row ─────────────────────────────────────────────────── */
function FactorRow({ factor }: { factor: FinavaFactor }) {
  const hasScore = factor.score !== null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "5px 0 5px 106px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10.5, color: "var(--color-text-secondary)", width: 80, flexShrink: 0 }}>{factor.label}</span>
        {hasScore ? (
          <>
            <div style={{ flex: 1, height: 3, borderRadius: 99, background: "var(--color-surface-2)", overflow: "hidden" }}>
              <div style={{ width: `${factor.score}%`, height: "100%", background: factor.score! >= 60 ? "var(--color-bull)" : factor.score! <= 40 ? "var(--color-bear)" : "var(--color-warn)", borderRadius: 99, transition: "width 0.4s ease" }} />
            </div>
            <span className="mono" style={{ fontSize: 9.5, color: "var(--color-muted)", width: 22, textAlign: "right" }}>{factor.score}</span>
          </>
        ) : (
          <>
            <div style={{ flex: 1, height: 3, borderRadius: 99, background: "var(--color-surface-2)" }} />
            <span className="mono" style={{ fontSize: 9.5, color: "var(--color-muted)", width: 22, textAlign: "right" }}>—</span>
          </>
        )}
      </div>
      {factor.detail && (
        <p style={{ margin: 0, fontSize: 10, color: "var(--color-muted)", lineHeight: 1.4, paddingLeft: 88 }}>{factor.detail}</p>
      )}
    </div>
  );
}

/* ── one signal bar (progressive) ─────────────────────────────────────────── */
function SignalBar({
  signalKey,
  signal,
  expanded,
  onToggle,
}: {
  signalKey: SignalKey;
  signal: FinavaSignal | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = SIGNAL_LABELS[signalKey];
  if (!signal) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "9px 0" }}>
        <span style={{ fontSize: 11.5, color: "var(--color-muted)", width: 96, flexShrink: 0 }}>{label}</span>
        <div className="skeleton" style={{ flex: 1, height: 4, borderRadius: 99 }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", width: 24, textAlign: "right" }}>··</span>
      </div>
    );
  }

  const isNoData = signal.isNoData === true;
  const color = stanceColor(signal.stance);
  const hasFactors = Array.isArray(signal.factors) && signal.factors.length > 0;

  return (
    <div className="fade-in" style={{ margin: "9px 0" }}>
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11.5, color: "var(--color-text-secondary)", width: 96, flexShrink: 0 }}>{label}</span>

        {/* Bar track */}
        <div style={{ flex: 1, height: 4, borderRadius: 99, background: "var(--color-surface-2)", overflow: "hidden" }}>
          {isNoData ? null : (
            <div style={{ width: `${signal.score}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
          )}
        </div>

        {/* Score / N/A + optional chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, width: 40, justifyContent: "flex-end" }}>
          {isNoData ? (
            <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", fontStyle: "italic" }}>N/A</span>
          ) : (
            <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: "var(--color-text)", width: 24, textAlign: "right" }}>{signal.score}</span>
          )}
          {hasFactors && (
            <button
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${label} factors`}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--color-muted)",
                display: "flex",
                alignItems: "center",
                lineHeight: 1,
                transition: "color 0.2s ease",
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
              >
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Headline / no-data pill */}
      {isNoData ? (
        <p style={{ margin: "3px 0 0 106px", fontSize: 11, color: "var(--color-muted)", lineHeight: 1.4, fontStyle: "italic" }}>No data available</p>
      ) : (
        <p style={{ margin: "3px 0 0 106px", fontSize: 11, color: "var(--color-muted)", lineHeight: 1.4 }}>{signal.headline}</p>
      )}

      {/* Factor breakdown — subtle height/opacity transition */}
      {hasFactors && (
        <div
          style={{
            overflow: "hidden",
            maxHeight: expanded ? `${signal.factors!.length * 54}px` : 0,
            opacity: expanded ? 1 : 0,
            transition: "max-height 0.25s ease, opacity 0.2s ease",
          }}
        >
          <div style={{ borderLeft: "1px solid var(--color-border)", marginLeft: 106, marginTop: 4, paddingLeft: 0 }}>
            {signal.factors!.map((f) => (
              <FactorRow key={f.key} factor={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfDots({ confidence }: { confidence: "Low" | "Moderate" | "High" }) {
  const on = confidence === "High" ? 3 : confidence === "Moderate" ? 2 : 1;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "7px 11px" }}>
      <span className="mono" style={{ fontSize: 9, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Confidence</span>
      <div style={{ display: "flex", gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: 99, background: i < on ? "var(--color-bull)" : "var(--color-surface-2)" }} />
        ))}
      </div>
    </div>
  );
}

function CompareBox({ src, value, price, highlight }: { src: string; value: number | null; price: number | null; highlight?: boolean }) {
  const up = value != null && price && price > 0 ? ((value - price) / price) * 100 : null;
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "9px 6px", borderRadius: 8, background: highlight ? "var(--color-accent-light)" : "var(--color-surface)", border: `1px solid ${highlight ? "var(--color-accent-medium)" : "var(--color-border)"}` }}>
      <div className="mono" style={{ fontSize: 8.5, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{src}</div>
      <div className="serif" style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>{value != null ? fmtMoney(value).replace(".00", "") : "—"}</div>
      <div className="mono" style={{ fontSize: 9.5, marginTop: 1, color: up == null ? "var(--color-muted)" : up >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>{up != null ? signedPct(up) : "n/a"}</div>
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export function FinavaTab({ ticker }: { ticker: string }) {
  const { status, analysis, error, run, retry } = useFinava(ticker);
  const { quoteMap } = useQuotes([ticker]);
  const price = quoteMap.get(ticker)?.price ?? null;

  // Track which signal rows are expanded (by key).
  const [expandedKeys, setExpandedKeys] = useState<Set<SignalKey>>(new Set());

  function toggleExpanded(key: SignalKey) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  // Tab click mounts this component — fire the run (no-op if already cached).
  useEffect(() => {
    run();
  }, [run]);

  const verdict = analysis.verdict;
  const byKey = new Map(analysis.signals.map((s) => [s.key, s]));
  const ringColor = verdict ? stanceColor(verdict.score >= 60 ? "bullish" : verdict.score <= 40 ? "bearish" : "neutral") : "var(--color-accent)";

  if (status === "error" && analysis.signals.length === 0) {
    return (
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
        <p style={{ fontSize: 13, color: "var(--color-bear)" }}>{error ?? "The analysis failed."}</p>
        <button className="tbtn on" onClick={retry}>RETRY ANALYSIS</button>
      </div>
    );
  }

  return (
    <div className="fade-in finava-grid" style={{ display: "grid", gridTemplateColumns: "168px 1fr", gap: 28, alignItems: "start" }}>
      {/* ── left panel ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 14, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12 }}>
        <ScoreRing score={verdict?.score ?? null} color={ringColor} pending={!verdict} />
        {verdict ? (
          <span className="mono fade-in" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 4, color: stanceColor(verdict.score >= 60 ? "bullish" : verdict.score <= 40 ? "bearish" : "neutral"), background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
            {verdict.stance}
          </span>
        ) : (
          <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.05em" }}>ANALYSING…</span>
        )}

        {(() => {
          // Only headline a dollar fair value when a Street analyst anchor corroborates
          // it; otherwise the number is a lone DCF, which is too noisy to show as a
          // confident target. Until then, headline the steadier peer-relative read.
          const hasStreet = verdict?.comparison?.street != null;
          const showFair = !!verdict && hasStreet && verdict.fairValue != null;
          const prem = verdict?.peerPremiumPct ?? null;
          const cardStyle = { width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "9px 11px" } as const;
          const labelStyle = { fontSize: 9, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" } as const;

          if (showFair) {
            return (
              <div style={cardStyle}>
                <div className="mono" style={labelStyle}>Fair Value</div>
                <div className="serif" style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text)", marginTop: 1 }}>{fmtMoney(verdict!.fairValue)}</div>
                <div className="mono" style={{ fontSize: 9.5, marginTop: 1, color: verdict!.upsidePct == null ? "var(--color-muted)" : verdict!.upsidePct >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
                  {verdict!.upsidePct != null ? `${signedPct(verdict!.upsidePct)} ${verdict!.upsidePct >= 0 ? "upside" : "downside"}` : "—"}
                </div>
              </div>
            );
          }

          if (verdict && prem != null) {
            // A qualitative band, not a precise % — the blended premium is too noisy
            // (peer-list quality, volatile P/S) to headline a number. Exact multiples
            // live in the expandable Valuation breakdown. Cheaper-than-peers = attractive.
            const band = prem <= -20 ? "Discount to peers" : prem >= 20 ? "Premium to peers" : "In line with peers";
            const color = prem <= -20 ? "var(--color-bull)" : prem >= 20 ? "var(--color-bear)" : "var(--color-muted)";
            return (
              <div style={cardStyle}>
                <div className="mono" style={labelStyle}>Valuation vs Peers</div>
                <div className="serif" style={{ fontSize: 16, fontWeight: 700, marginTop: 1, color }}>{band}</div>
                <div className="mono" style={{ fontSize: 9.5, marginTop: 1, color: "var(--color-muted)" }}>on P/E &amp; P/S · see breakdown</div>
              </div>
            );
          }

          return (
            <div style={cardStyle}>
              <div className="mono" style={labelStyle}>Fair Value</div>
              <div className="serif" style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text)", marginTop: 1 }}>—</div>
            </div>
          );
        })()}

        {verdict && <ConfDots confidence={verdict.confidence} />}
      </div>

      {/* ── right column ───────────────────────────────────────────────────── */}
      <div style={{ minWidth: 0 }}>
        <Rule>Signal Breakdown</Rule>
        {SIGNAL_ORDER.map((k) => (
          <SignalBar
            key={k}
            signalKey={k}
            signal={byKey.get(k)}
            expanded={expandedKeys.has(k)}
            onToggle={() => toggleExpanded(k)}
          />
        ))}

        <div style={{ marginTop: 18 }}>
          <Rule>The Finava Take</Rule>
          {verdict ? (
            <p className="fade-in" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: "var(--color-text-secondary)" }}>{verdict.take}</p>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-muted)" }}>Synthesising the verdict from the signals above…</p>
          )}
        </div>

        {verdict && (
          <div className="fade-in" style={{ marginTop: 18 }}>
            <Rule>Valuation · vs ${price != null ? price.toFixed(2) : "—"}</Rule>
            <div style={{ display: "flex", gap: 8 }}>
              <CompareBox src="Finava" value={verdict.comparison.finava} price={price} highlight />
              <CompareBox src="Street" value={verdict.comparison.street} price={price} />
              <CompareBox src="DCF" value={verdict.comparison.dcf} price={price} />
            </div>
          </div>
        )}

        {verdict && (verdict.catalysts.length > 0 || verdict.risks.length > 0) && (
          <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 18 }}>
            {verdict.catalysts.length > 0 && (
              <div>
                <Rule>Catalysts</Rule>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {verdict.catalysts.map((c, i) => (
                    <span key={i} style={{ fontSize: 10.5, color: "var(--color-bull)", background: "var(--color-bg)", border: "1px solid color-mix(in oklab, var(--color-bull) 35%, var(--color-border))", borderRadius: 4, padding: "3px 8px" }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
            {verdict.risks.length > 0 && (
              <div>
                <Rule>Risk Flags</Rule>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {verdict.risks.map((r, i) => (
                    <span key={i} style={{ fontSize: 10.5, color: "var(--color-bear)", background: "var(--color-bg)", border: "1px solid color-mix(in oklab, var(--color-bear) 35%, var(--color-border))", borderRadius: 4, padding: "3px 8px" }}>{r}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mono" style={{ margin: "20px 0 0", fontSize: 10.5, color: "var(--color-muted)" }}>
          Six signals scored from real fundamentals, valuation, analyst, momentum, sentiment &amp; insider data · AI-generated, may contain errors · research color, not investment advice.
        </p>
      </div>
    </div>
  );
}
