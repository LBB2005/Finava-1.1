"use client";
import { useEffect } from "react";
import { useLucra } from "@/hooks/useLucra";
import { useQuotes } from "@/hooks/useQuotes";
import {
  SIGNAL_ORDER,
  SIGNAL_LABELS,
  type LucraSignal,
  type Stance,
  type SignalKey,
} from "@/lib/lucra";

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
        animation: pending ? "lucraPulse 1.4s ease-in-out infinite" : undefined,
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

/* ── one signal bar (progressive) ─────────────────────────────────────────── */
function SignalBar({ signalKey, signal }: { signalKey: SignalKey; signal: LucraSignal | undefined }) {
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
  const color = stanceColor(signal.stance);
  return (
    <div className="fade-in" style={{ margin: "9px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11.5, color: "var(--color-text-secondary)", width: 96, flexShrink: 0 }}>{label}</span>
        <div style={{ flex: 1, height: 4, borderRadius: 99, background: "var(--color-surface-2)", overflow: "hidden" }}>
          <div style={{ width: `${signal.score}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
        </div>
        <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: "var(--color-text)", width: 24, textAlign: "right" }}>{signal.score}</span>
      </div>
      <p style={{ margin: "3px 0 0 106px", fontSize: 11, color: "var(--color-muted)", lineHeight: 1.4 }}>{signal.headline}</p>
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
export function LucraTab({ ticker }: { ticker: string }) {
  const { status, analysis, error, run, retry } = useLucra(ticker);
  const { quoteMap } = useQuotes([ticker]);
  const price = quoteMap.get(ticker)?.price ?? null;

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
    <div className="fade-in lucra-grid" style={{ display: "grid", gridTemplateColumns: "168px 1fr", gap: 28, alignItems: "start" }}>
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

        <div style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "9px 11px" }}>
          <div className="mono" style={{ fontSize: 9, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Fair Value</div>
          <div className="serif" style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text)", marginTop: 1 }}>{verdict ? fmtMoney(verdict.fairValue) : "—"}</div>
          <div className="mono" style={{ fontSize: 9.5, marginTop: 1, color: verdict?.upsidePct == null ? "var(--color-muted)" : verdict.upsidePct >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
            {verdict?.upsidePct != null ? `${signedPct(verdict.upsidePct)} upside` : "—"}
          </div>
        </div>

        {verdict && <ConfDots confidence={verdict.confidence} />}
      </div>

      {/* ── right column ───────────────────────────────────────────────────── */}
      <div style={{ minWidth: 0 }}>
        <Rule>Signal Breakdown</Rule>
        {SIGNAL_ORDER.map((k) => (
          <SignalBar key={k} signalKey={k} signal={byKey.get(k)} />
        ))}

        <div style={{ marginTop: 18 }}>
          <Rule>The Lucra Take</Rule>
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
              <CompareBox src="Lucra" value={verdict.comparison.lucra} price={price} highlight />
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
          Five AI signals synthesised from fundamentals, price action, news, analyst coverage &amp; insider filings · research color, not investment advice.
        </p>
      </div>
    </div>
  );
}
