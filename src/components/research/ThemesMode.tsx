"use client";
import { useMemo, useState } from "react";
import { composite, grade, type RankedStock, type Stock } from "@/lib/research";
import { useThemes } from "@/hooks/useThemes";
import type { Theme } from "@/lib/researchAI";
import LadderRow from "./LadderRow";

/** Average year-horizon Finava score of a theme's resolved constituents. */
function themeStrength(stocks: Stock[]): number {
  if (!stocks.length) return 0;
  return Math.round(stocks.reduce((a, s) => a + composite(s, "year"), 0) / stocks.length);
}

export default function ThemesMode({ universe }: { universe: Stock[] }) {
  const { themes, isLoading, error } = useThemes();
  const [open, setOpen] = useState<string | null>(null);

  const byTicker = useMemo(() => new Map(universe.map((s) => [s.ticker, s])), [universe]);

  // Resolve each theme's tickers to live scored stocks (drop any not in the universe yet).
  const resolved = useMemo(() => {
    if (!themes) return [];
    return themes.map((t: Theme) => {
      const stocks = t.tickers.map((tk) => byTicker.get(tk)).filter((s): s is Stock => !!s);
      return { theme: t, stocks, strength: themeStrength(stocks) };
    }).filter((r) => r.stocks.length > 0 || universe.length === 0);
  }, [themes, byTicker, universe.length]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: 280, gap: 8, textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--color-bear)" }}>Themes are unavailable right now.</p>
        <p style={{ fontSize: 12, color: "var(--color-muted)" }}>The theme generator failed — try refreshing in a moment.</p>
      </div>
    );
  }

  if (isLoading || !themes) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: 280, gap: 10 }}>
        <div className="spin" style={{ width: 28, height: 28, border: "2.5px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%" }} />
        <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Generating themes across the S&amp;P 500…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
      {resolved.map(({ theme, stocks, strength }) => {
        const isOpen = open === theme.key;
        const ranked: RankedStock[] = [...stocks]
          .map((s) => { const score = composite(s, "year"); return { ...s, score, grade: grade(score) }; })
          .sort((a, b) => b.score - a.score)
          .map((s, i) => ({ ...s, rank: i + 1 }));
        return (
          <div
            key={theme.key}
            style={{ gridColumn: isOpen ? "1 / -1" : undefined, border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}
          >
            <button
              onClick={() => setOpen(isOpen ? null : theme.key)}
              style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "13px 15px", display: "flex", flexDirection: "column", gap: 7 }}
            >
              <div className="flex items-center justify-between" style={{ gap: 8 }}>
                <span className="serif" style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)" }}>{theme.name}</span>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)", flexShrink: 0 }}>{stocks.length} names</span>
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-text-secondary)" }}>{theme.thesis}</p>
              <div className="flex items-center" style={{ gap: 9, marginTop: 2 }}>
                <div className="fbar-track" style={{ flex: 1, height: 6 }}>
                  <div className="fbar-fill" style={{ width: strength + "%", height: "100%", background: "var(--color-accent)" }} />
                </div>
                <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text)" }}>{strength}</span>
                <span className="mono" style={{ fontSize: 9.5, color: "var(--color-muted)", letterSpacing: "0.06em" }}>{isOpen ? "CLOSE ▲" : "OPEN ▼"}</span>
              </div>
            </button>

            {isOpen && ranked.length > 0 && (
              <div style={{ overflowX: "auto", borderTop: "1px solid var(--color-border)" }}>
                <table className="lad-table" style={{ minWidth: 620, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", width: 36 }}>#</th>
                      <th style={{ textAlign: "left", width: 160 }}>Ticker</th>
                      <th style={{ textAlign: "right", width: 68 }}>Last</th>
                      <th style={{ textAlign: "right", width: 60 }}>Chg</th>
                      <th style={{ textAlign: "center", width: 132 }}>Factor profile</th>
                      <th style={{ textAlign: "left" }}>Score</th>
                      <th style={{ textAlign: "center", width: 48 }}>Grd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((s) => <LadderRow key={s.ticker} s={s} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
