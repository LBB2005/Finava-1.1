"use client";
import { useMemo, useState } from "react";
import {
  FACTORS,
  factorColor,
  fmtMktCap,
  fmtPE,
  fmtPct1,
  type Stock,
} from "@/lib/research";
import { authFetch } from "@/lib/authFetch";
import type { CompareStock, CompareVerdict } from "@/lib/researchAI";
import { RadarOverlay } from "./primitives";

// Distinct series colours for up to 5 overlaid stocks.
const COLORS = ["var(--color-accent)", "#e0734d", "#3fae6b", "#b06bd6", "#d6a93f"];
const MAX = 5;

type Status = "idle" | "loading" | "done" | "error";

function avgScore(f: Record<string, number>): number {
  const sum = FACTORS.reduce((a, fc) => a + f[fc.key], 0);
  return Math.round(sum / FACTORS.length);
}

export default function CompareMode({ universe, loading }: { universe: Stock[]; loading: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState<CompareVerdict | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string | null>(null);

  const byTicker = useMemo(() => new Map(universe.map((s) => [s.ticker, s])), [universe]);
  const selected = useMemo(
    () => picked.map((t) => byTicker.get(t)).filter((s): s is Stock => !!s),
    [picked, byTicker]
  );

  const suggestions = useMemo(() => {
    const term = q.trim().toUpperCase();
    if (!term) return [];
    return universe
      .filter((s) => !picked.includes(s.ticker))
      .filter((s) => s.ticker.includes(term) || s.name.toUpperCase().includes(term))
      .slice(0, 8);
  }, [q, universe, picked]);

  function add(ticker: string) {
    if (picked.length >= MAX || picked.includes(ticker)) return;
    setPicked((p) => [...p, ticker]);
    setQ("");
    setVerdict(null);
    setStatus("idle");
  }
  function remove(ticker: string) {
    setPicked((p) => p.filter((t) => t !== ticker));
    setVerdict(null);
    setStatus("idle");
  }

  async function runVerdict() {
    if (selected.length < 2) return;
    setStatus("loading");
    setErr(null);
    const stocks: CompareStock[] = selected.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      price: s.price,
      chg: s.chg,
      pe: s.pe ?? null,
      marketCap: s.marketCap ?? null,
      f: s.f,
    }));
    try {
      const res = await authFetch("/api/research/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stocks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setVerdict(data.verdict as CompareVerdict);
      setStatus("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to compare.");
      setStatus("error");
    }
  }

  const colorOf = (ticker: string) => COLORS[picked.indexOf(ticker) % COLORS.length];

  return (
    <div className="flex" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      {/* ── Picker + matrix ─────────────────────────────────────── */}
      <div style={{ flex: "1 1 460px", minWidth: 320, border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}>
        <div className="flex items-center justify-between" style={{ padding: "9px 14px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--color-text)" }}>HEAD-TO-HEAD</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.08em" }}>{picked.length}/{MAX} PICKED</span>
        </div>

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Search / add */}
          <div style={{ position: "relative" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={loading ? "Loading S&P 500…" : "Add a ticker or company…"}
              disabled={loading || picked.length >= MAX}
              className="mono"
              style={{
                width: "100%", padding: "9px 12px", fontSize: 12.5, color: "var(--color-text)",
                background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, outline: "none",
              }}
            />
            {suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
                {suggestions.map((s) => (
                  <button
                    key={s.ticker}
                    onClick={() => add(s.ticker)}
                    className="flex items-baseline"
                    style={{ width: "100%", gap: 8, padding: "8px 12px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", borderBottom: "1px solid var(--color-border)" }}
                  >
                    <span className="tk mono" style={{ fontSize: 12, fontWeight: 700 }}>{s.ticker}</span>
                    <span style={{ fontSize: 11, color: "var(--color-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Picked chips */}
          {picked.length > 0 && (
            <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
              {selected.map((s) => (
                <span key={s.ticker} className="mono flex items-center" style={{ gap: 6, padding: "4px 8px", fontSize: 11.5, fontWeight: 700, borderRadius: 4, border: `1px solid ${colorOf(s.ticker)}`, color: colorOf(s.ticker), background: `color-mix(in oklab, ${colorOf(s.ticker)} 8%, transparent)` }}>
                  {s.ticker}
                  <button onClick={() => remove(s.ticker)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          )}

          {selected.length < 2 ? (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: 220, padding: 24, textAlign: "center", gap: 8 }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h7M14 12h7M7 8l-4 4 4 4M17 8l4 4-4 4" />
              </svg>
              <p className="serif" style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>Pick two or more to compare</p>
              <p style={{ fontSize: 12, color: "var(--color-muted)", maxWidth: 320, lineHeight: 1.5 }}>
                Add up to five names and Finava overlays their factor profiles, then an analyst agent calls the head-to-head.
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <RadarOverlay series={selected.map((s) => ({ ticker: s.ticker, f: s.f, color: colorOf(s.ticker) }))} size={250} />
              </div>

              {/* Factor matrix */}
              <div style={{ overflowX: "auto" }}>
                <table className="lad-table" style={{ width: "100%", minWidth: 320 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Factor</th>
                      {selected.map((s) => (
                        <th key={s.ticker} style={{ textAlign: "right", color: colorOf(s.ticker) }}>{s.ticker}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FACTORS.map((fc) => {
                      const best = Math.max(...selected.map((s) => s.f[fc.key]));
                      return (
                        <tr key={fc.key}>
                          <td style={{ textAlign: "left", fontSize: 11.5, color: "var(--color-text-secondary)" }}>{fc.full}</td>
                          {selected.map((s) => {
                            const v = s.f[fc.key];
                            const isBest = v === best;
                            return (
                              <td key={s.ticker} className="mono" style={{ textAlign: "right", fontSize: 12.5, fontWeight: isBest ? 800 : 500, color: isBest ? factorColor(v) : "var(--color-muted)" }}>
                                {v}{isBest && selected.length > 1 ? " ●" : ""}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr>
                      <td style={{ textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "var(--color-text)" }}>Avg score</td>
                      {selected.map((s) => (
                        <td key={s.ticker} className="mono serif" style={{ textAlign: "right", fontSize: 15, fontWeight: 800, color: "var(--color-text)" }}>{avgScore(s.f)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td style={{ textAlign: "left", fontSize: 11, color: "var(--color-muted)" }}>Price / Chg</td>
                      {selected.map((s) => (
                        <td key={s.ticker} className="mono" style={{ textAlign: "right", fontSize: 11 }}>
                          <span style={{ color: "var(--color-text)" }}>{s.price.toFixed(2)}</span>{" "}
                          <span style={{ color: s.chg >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>{fmtPct1(s.chg)}</span>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={{ textAlign: "left", fontSize: 11, color: "var(--color-muted)" }}>P/E · Mkt cap</td>
                      {selected.map((s) => (
                        <td key={s.ticker} className="mono" style={{ textAlign: "right", fontSize: 11, color: "var(--color-text-secondary)" }}>{fmtPE(s.pe)} · {fmtMktCap(s.marketCap)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <button
                onClick={runVerdict}
                disabled={status === "loading"}
                className="mono"
                style={{
                  width: "100%", padding: "10px 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                  color: "#fff", background: "var(--color-accent)", border: "1px solid var(--color-accent)",
                  borderRadius: 4, cursor: status === "loading" ? "default" : "pointer", opacity: status === "loading" ? 0.7 : 1,
                }}
              >
                {status === "loading" ? "ANALYSING…" : verdict ? "RE-RUN VERDICT →" : "RUN AI VERDICT →"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Verdict ─────────────────────────────────────────────── */}
      <div style={{ flex: "1 1 380px", minWidth: 300, border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}>
        <div className="flex items-center justify-between" style={{ padding: "9px 14px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--color-text)" }}>FINAVA VERDICT</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.08em" }}>RESEARCH COLOR</span>
        </div>

        <div style={{ padding: "16px" }}>
          {status === "loading" ? (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: 240, gap: 10 }}>
              <div className="spin" style={{ width: 28, height: 28, border: "2.5px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%" }} />
              <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Weighing the head-to-head…</p>
            </div>
          ) : status === "error" ? (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: 240, gap: 8, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--color-bear)" }}>{err}</p>
              <button className="tbtn" onClick={runVerdict}>Retry</button>
            </div>
          ) : verdict ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {verdict.winner && (
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.1em" }}>STRONGEST PICK</span>
                  <span className="mono" style={{ fontSize: 15, fontWeight: 800, padding: "2px 10px", borderRadius: 4, color: "#fff", background: colorOf(verdict.winner) }}>{verdict.winner}</span>
                </div>
              )}
              {verdict.summary && (
                <p className="serif" style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--color-text)" }}>{verdict.summary}</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {verdict.perStock.map((ps) => (
                  <div key={ps.ticker} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
                    <div className="flex items-baseline" style={{ gap: 8, marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: colorOf(ps.ticker) }}>{ps.ticker}</span>
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{ps.oneLiner}</span>
                    </div>
                    {ps.bullCase && <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--color-text-secondary)" }}><span style={{ color: "var(--color-bull)", fontWeight: 700 }}>Bull · </span>{ps.bullCase}</p>}
                    {ps.bearCase && <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--color-text-secondary)" }}><span style={{ color: "var(--color-bear)", fontWeight: 700 }}>Bear · </span>{ps.bearCase}</p>}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 10, color: "var(--color-muted)", lineHeight: 1.5 }}>Informational research, not advice.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: 240, gap: 8, textAlign: "center" }}>
              <p style={{ fontSize: 12.5, color: "var(--color-muted)", maxWidth: 280, lineHeight: 1.5 }}>
                {selected.length < 2 ? "Pick at least two stocks, then run the AI verdict." : "Run the verdict to get the head-to-head call."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
