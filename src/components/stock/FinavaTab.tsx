"use client";
import { useFinava } from "@/hooks/useFinava";
import { useVerdictCache } from "@/hooks/useVerdictCache";
import { useQuotes } from "@/hooks/useQuotes";
import {
  SIGNAL_ORDER,
  SIGNAL_LABELS,
  type FinavaSignal,
  type Stance,
  type SignalKey,
} from "@/lib/finava";
import ModelBadge, { PoweredByStrip } from "@/components/ui/ModelBadge";
import Rule from "@/components/ui/Rule";
import { slugToBrand, rosterFromBrands, type Brand } from "@/lib/models";

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
          <span className="skeleton" style={{ width: 30, height: 10, borderRadius: 99 }} aria-label="Scoring" />
        ) : (
          <>
            <span className="serif" style={{ fontSize: "var(--text-stat)", fontWeight: 800, color: "var(--color-text)", lineHeight: 1 }}>{score}</span>
            <span className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", letterSpacing: "0.08em", marginTop: 2 }}>/ 100</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── one signal bar (progressive) ─────────────────────────────────────────── */
function SignalBar({ signalKey, signal }: { signalKey: SignalKey; signal: FinavaSignal | undefined }) {
  const label = SIGNAL_LABELS[signalKey];
  if (!signal) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "9px 0" }}>
        <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", width: 96, flexShrink: 0 }}>{label}</span>
        <div className="skeleton" style={{ flex: 1, height: 4, borderRadius: 99 }} />
        <span className="skeleton" style={{ width: 24, height: 10, borderRadius: 99 }} />
      </div>
    );
  }
  const color = stanceColor(signal.stance);
  return (
    <div className="fade-in" style={{ margin: "9px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: "var(--text-meta)", color: "var(--color-text-secondary)", width: 96, flexShrink: 0 }}>{label}</span>
        <div style={{ flex: 1, height: 4, borderRadius: 99, background: "var(--color-surface-2)", overflow: "hidden" }}>
          <div style={{ width: `${signal.score}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
        </div>
        <span className="mono" style={{ fontSize: "var(--text-micro)", fontWeight: 600, color: "var(--color-text)", width: 24, textAlign: "right" }}>{signal.score}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "3px 0 0 106px" }}>
        <p style={{ margin: 0, flex: 1, fontSize: "var(--text-meta)", color: "var(--color-muted)", lineHeight: 1.4 }}>{signal.headline}</p>
        {signal.model && <ModelBadge slug={signal.model} size={11} />}
      </div>
    </div>
  );
}

function ConfDots({ confidence }: { confidence: "Low" | "Moderate" | "High" }) {
  const on = confidence === "High" ? 3 : confidence === "Moderate" ? 2 : 1;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "7px 11px" }}>
      <span className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Confidence</span>
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
    <div style={{ flex: 1, textAlign: "center", padding: "9px 6px", borderRadius: "var(--radius-md)", background: highlight ? "var(--color-accent-light)" : "var(--color-surface)", border: `1px solid ${highlight ? "var(--color-accent-medium)" : "var(--color-border)"}` }}>
      <div className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{src}</div>
      <div className="serif" style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--color-text)" }}>{value != null ? fmtMoney(value).replace(".00", "") : "—"}</div>
      <div className="mono" style={{ fontSize: "var(--text-micro)", marginTop: 1, color: up == null ? "var(--color-muted)" : up >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>{up != null ? signedPct(up) : "n/a"}</div>
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export function FinavaTab({ ticker }: { ticker: string }) {
  const { status, analysis, error, run, retry } = useFinava(ticker);
  const { quoteMap } = useQuotes([ticker]);
  const price = quoteMap.get(ticker)?.price ?? null;

  // Cached-first: hydrate the store from the persisted verdict (free) instead
  // of auto-running on mount. Runs start ONLY from explicit actions — the
  // button below, the rail's Generate/↻, or a ?run=1 deep link.
  const { neverRun, resolving } = useVerdictCache(ticker);

  const verdict = analysis.verdict;
  const byKey = new Map(analysis.signals.map((s) => [s.key, s]));
  const ringColor = verdict ? stanceColor(verdict.score >= 60 ? "bullish" : verdict.score <= 40 ? "bearish" : "neutral") : "var(--color-accent)";

  if (status === "idle") {
    if (resolving && !neverRun) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="skeleton" style={{ width: 168, height: 168 }} />
          <div className="skeleton" style={{ width: "60%", height: 16 }} />
        </div>
      );
    }
    // Never run (or cache unavailable) — the one-click metered entry point.
    return (
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", maxWidth: 480, lineHeight: 1.6 }}>
          Deploy Finava&apos;s five specialist agents — fundamentals, momentum, sentiment,
          analyst, insider — to score {ticker.toUpperCase()} and write a verdict.
        </p>
        <button className="tbtn on" onClick={run}>RUN FINAVA&apos;S 5-AGENT ANALYSIS</button>
      </div>
    );
  }

  if (status === "error" && analysis.signals.length === 0) {
    return (
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-bear)" }}>{error ?? "The analysis failed."}</p>
        <button className="tbtn on" onClick={retry}>RETRY ANALYSIS</button>
      </div>
    );
  }

  return (
    <div className="fade-in finava-grid" style={{ display: "grid", gridTemplateColumns: "168px 1fr", gap: 28, alignItems: "start" }}>
      {/* ── left panel ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 14, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
        <ScoreRing score={verdict?.score ?? null} color={ringColor} pending={!verdict} />
        {verdict ? (
          <span className={"mono fade-in pill " + (verdict.score >= 60 ? "pill-bull" : verdict.score <= 40 ? "pill-bear" : "pill-warn")}>
            {verdict.stance}
          </span>
        ) : (
          <span className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", letterSpacing: "0.05em" }}>ANALYSING…</span>
        )}

        <div style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "9px 11px" }}>
          <div className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Fair Value</div>
          <div className="serif" style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--color-text)", marginTop: 1 }}>{verdict ? fmtMoney(verdict.fairValue) : "—"}</div>
          <div className="mono" style={{ fontSize: "var(--text-micro)", marginTop: 1, color: verdict?.upsidePct == null ? "var(--color-muted)" : verdict.upsidePct >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
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

        <div style={{ marginTop: 20 }}>
          <Rule>The Finava Take</Rule>
          {verdict ? (
            <p className="fade-in" style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--color-text-secondary)" }}>{verdict.take}</p>
          ) : (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>Synthesising the verdict from the signals above…</p>
          )}
        </div>

        {verdict && (
          <div className="fade-in" style={{ marginTop: 20 }}>
            <Rule>Valuation · vs ${price != null ? price.toFixed(2) : "—"}</Rule>
            <div style={{ display: "flex", gap: 8 }}>
              <CompareBox src="Finava" value={verdict.comparison.finava} price={price} highlight />
              <CompareBox src="Street" value={verdict.comparison.street} price={price} />
              <CompareBox src="DCF" value={verdict.comparison.dcf} price={price} />
            </div>
          </div>
        )}

        {verdict && (verdict.catalysts.length > 0 || verdict.risks.length > 0) && (
          <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 20 }}>
            {verdict.catalysts.length > 0 && (
              <div>
                <Rule>Catalysts</Rule>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {verdict.catalysts.map((c, i) => (
                    <span key={i} style={{ fontSize: "var(--text-micro)", color: "var(--color-bull)", background: "var(--color-bg)", border: "1px solid color-mix(in oklab, var(--color-bull) 35%, var(--color-border))", borderRadius: "var(--radius-xs)", padding: "3px 8px" }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
            {verdict.risks.length > 0 && (
              <div>
                <Rule>Risk Flags</Rule>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {verdict.risks.map((r, i) => (
                    <span key={i} style={{ fontSize: "var(--text-micro)", color: "var(--color-bear)", background: "var(--color-bg)", border: "1px solid color-mix(in oklab, var(--color-bear) 35%, var(--color-border))", borderRadius: "var(--radius-xs)", padding: "3px 8px" }}>{r}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(() => {
          const brands = rosterFromBrands([
            ...Array.from(byKey.values()).flatMap((s): Brand[] => (s?.model ? [slugToBrand(s.model)] : [])),
            ...(verdict?.model ? [slugToBrand(verdict.model)] : []),
          ]);
          return brands.length ? (
            <div className="fade-in" style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--color-border)" }}>
              <PoweredByStrip brands={brands} />
            </div>
          ) : null;
        })()}

        <p className="mono" style={{ margin: "14px 0 0", fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>
          Five AI signals — each scored by a different best-fit model, synthesised by Claude · AI-generated, may contain errors · research color, not investment advice.
        </p>
      </div>
    </div>
  );
}
