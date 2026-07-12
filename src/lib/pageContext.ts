import { z } from "zod";
import type { StockBundle, StockProfile, KeyStats, AnalystRatings } from "@/lib/stockData";
import type { FundamentalTimeSeries } from "@/lib/edgar";
import type { TickerSnapshot } from "@/lib/finnhub";

/**
 * Structured snapshot of the page the user is looking at when they send a chat
 * message, so the model can scope its answer to that page and resolve vague
 * references ("this", "the stock", "these names", "how am I doing?").
 *
 * `snapshot` is a compact, human-readable CORE summary (see the build* helpers)
 * — kept deliberately small so it grounds the answer without drowning the actual
 * question or bloating token cost. It travels client → `/api/chat` (and
 * `/api/agent`, `/api/classify`) and is remembered per-conversation so follow-up
 * turns keep it. `ticker` is only set for `kind: "stock"`; `label` names the
 * page for the others (watchlist name, active research lens, etc.).
 */
export const PageContextSchema = z.object({
  kind: z.enum(["stock", "research", "watchlist", "portfolio"]),
  ticker: z.string().min(1).max(12).optional(),
  label: z.string().max(80).optional(),
  snapshot: z.string().max(4000),
});

export type PageContext = z.infer<typeof PageContextSchema>;

// ── Formatting helpers (pure) ───────────────────────────────────────────────

function fmtUsd(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** Market cap comes from Finnhub in MILLIONS of USD. */
function fmtUsdFromMillions(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  return fmtUsd(m * 1e6);
}

function fmt2(n: number | null | undefined): string | null {
  return n == null || !Number.isFinite(n) ? null : n.toFixed(2);
}

function pct(n: number | null | undefined): string | null {
  return n == null || !Number.isFinite(n) ? null : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/** Collapse the 5-bucket analyst spread into a plain-English consensus. */
function analystConsensus(a: AnalystRatings | null): string | null {
  if (!a) return null;
  const buys = a.strongBuy + a.buy;
  const sells = a.sell + a.strongSell;
  const total = buys + a.hold + sells;
  if (total <= 0) return a.targetMean != null ? `mean PT ${fmtUsd(a.targetMean)}` : null;
  let label: string;
  if (buys / total >= 0.6) label = "Buy";
  else if (sells / total >= 0.4) label = "Sell";
  else label = "Hold";
  const parts = [`consensus ${label} (${buys} buy / ${a.hold} hold / ${sells} sell)`];
  if (a.targetMean != null) parts.push(`mean PT ${fmtUsd(a.targetMean)}`);
  return parts.join(", ");
}

/**
 * Build the CORE snapshot string for a stock page: identity, live quote, key
 * valuation stats, analyst consensus, and the latest annual fundamentals. This
 * is the "core snapshot" scope — profile/quote/key-stats/fundamentals/analysts —
 * intentionally excluding news, sentiment, agent reports, and DCF to stay cheap.
 * Every field degrades to omitted (never fabricated) when its source is null.
 */
export function buildStockSnapshot(bundle: StockBundle): string {
  const profile: StockProfile | null = bundle.profile;
  const quote: TickerSnapshot | null = bundle.quote;
  const keyStats: KeyStats | null = bundle.keyStats;
  const analysts: AnalystRatings | null = bundle.analysts;
  const fundamentals: FundamentalTimeSeries | null = bundle.fundamentals;
  const ticker = bundle.ticker;

  const lines: string[] = [];

  const name = profile?.name ?? ticker;
  const idLine = [name && name !== ticker ? `${ticker} — ${name}` : ticker, profile?.exchange, profile?.industry]
    .filter(Boolean)
    .join(" · ");
  lines.push(idLine);

  if (quote?.price != null) {
    const priceStr = `Price ${fmtUsd(quote.price)}${quote.changePct != null ? ` (${pct(quote.changePct)})` : ""}`;
    lines.push(quote.asOf ? `${priceStr} — as of ${quote.asOf}` : priceStr);
  }

  const stats: string[] = [];
  const mc = fmtUsdFromMillions(keyStats?.marketCap ?? profile?.marketCap ?? null);
  if (mc) stats.push(`Mkt cap ${mc}`);
  if (keyStats?.peTTM != null) stats.push(`P/E ${fmt2(keyStats.peTTM)}`);
  if (keyStats?.epsTTM != null) stats.push(`EPS ${fmtUsd(keyStats.epsTTM)}`);
  if (keyStats?.high52 != null && keyStats?.low52 != null)
    stats.push(`52w ${fmtUsd(keyStats.low52)}–${fmtUsd(keyStats.high52)}`);
  if (keyStats?.beta != null) stats.push(`beta ${fmt2(keyStats.beta)}`);
  if (keyStats?.dividendYield != null) stats.push(`div yld ${keyStats.dividendYield.toFixed(2)}%`);
  if (stats.length) lines.push(stats.join(" · "));

  const consensus = analystConsensus(analysts);
  if (consensus) lines.push(`Analysts: ${consensus}`);

  if (fundamentals) {
    const rev = fundamentals.revenue.at(-1);
    const ni = fundamentals.netIncome.at(-1);
    const fbits: string[] = [];
    if (rev) fbits.push(`FY${rev.year} revenue ${fmtUsd(rev.value)}`);
    if (ni) {
      const margin = rev && rev.value ? ` (net margin ${((ni.value / rev.value) * 100).toFixed(1)}%)` : "";
      fbits.push(`net income ${fmtUsd(ni.value)}${margin}`);
    }
    if (fbits.length) lines.push(fbits.join(", "));
  }

  return lines.join("\n");
}

/** Compact watchlist snapshot: name + its tickers (capped). */
export function buildWatchlistSnapshot(name: string, tickers: string[]): string {
  if (!tickers.length) return `Watchlist "${name}" — empty (no tickers yet).`;
  const shown = tickers.slice(0, 40);
  const more = tickers.length > shown.length ? ` +${tickers.length - shown.length} more` : "";
  return `Watchlist "${name}" — ${tickers.length} name${tickers.length === 1 ? "" : "s"}: ${shown.join(", ")}${more}`;
}

/** Compact research-page snapshot: active lens + horizon + top-ranked names. */
export function buildResearchSnapshot(
  mode: string,
  horizon: string,
  top: { ticker: string; grade: string; score: number }[]
): string {
  const head = `Research page · ${mode.toUpperCase()} lens · ${horizon} horizon`;
  if (!top.length) return head;
  const names = top
    .slice(0, 8)
    .map((r) => `${r.ticker} (${r.grade}, ${Math.round(r.score)})`)
    .join(", ");
  return `${head}\nTop-ranked now: ${names}`;
}

/** Compact portfolio snapshot: totals + largest positions. (The full holdings
 *  detail still rides in portfolioContext; this just frames the viewed page.) */
export function buildPortfolioSnapshot(input: {
  totalValue: number;
  totalGainPct: number;
  positions: number;
  cash: number;
  top: { ticker: string; weightPct: number; gainLossPct: number }[];
}): string {
  const gain = `${input.totalGainPct >= 0 ? "+" : ""}${input.totalGainPct.toFixed(1)}% all-time`;
  const cashBit = input.cash > 0 ? `, ${fmtUsd(input.cash)} cash` : "";
  const lines = [
    `Portfolio — ${input.positions} position${input.positions === 1 ? "" : "s"}, total value ${fmtUsd(input.totalValue)} (${gain})${cashBit}`,
  ];
  if (input.top.length) {
    const largest = input.top
      .slice(0, 6)
      .map((h) => `${h.ticker} ${h.weightPct.toFixed(0)}% (${h.gainLossPct >= 0 ? "+" : ""}${h.gainLossPct.toFixed(1)}%)`)
      .join(", ");
    lines.push(`Largest: ${largest}`);
  }
  return lines.join("\n");
}

// Per-kind phrasing for where the user is + how to resolve vague references.
function pageWhereAndGuidance(pc: PageContext): { where: string; guidance: string } {
  switch (pc.kind) {
    case "stock":
      return {
        where: `the ${pc.ticker} stock page`,
        guidance: `Unless they clearly pivot to a different company or topic, treat ${pc.ticker} as the subject of their question — resolve vague references like "this", "the stock", "it", or "the company" to ${pc.ticker}.`,
      };
    case "research":
      return {
        where: `the Research page${pc.label ? ` (${pc.label})` : ""}`,
        guidance: `Scope screening/ranking/idea questions to what's shown here; resolve "these", "the top names", or "this screen" to the ranked list below.`,
      };
    case "watchlist":
      return {
        where: `their "${pc.label ?? "watchlist"}" watchlist`,
        guidance: `Resolve vague references like "these", "my list", or "these names" to the watchlist tickers below.`,
      };
    case "portfolio":
      return {
        where: `their Portfolio page`,
        guidance: `Resolve "my portfolio", "how am I doing?", or "these holdings" to their positions below.`,
      };
  }
}

/**
 * Wrap a PageContext into the system-prompt block injected server-side. Shared
 * by `/api/chat` and `/api/agent` so both routes anchor the answer identically.
 */
export function pageContextPrompt(pc: PageContext): string {
  const { where, guidance } = pageWhereAndGuidance(pc);
  return `## Page the user is currently viewing
The user sent this message while viewing ${where} in the Finava app. ${guidance} This is the snapshot they can see on the page right now:

${pc.snapshot}`;
}

/**
 * One-line hint for the Auto-mode intent router (`/api/classify`): pins the
 * subject to the viewed page so a vague prompt routes correctly instead of
 * asking "which stock?".
 */
export function pageContextRouteHint(pc: PageContext): string {
  switch (pc.kind) {
    case "stock":
      return `The user is currently viewing the ${pc.ticker} stock page. Treat vague references ("this", "it", "the stock", "a good entry point") as being about ${pc.ticker}: route to "agent" for ${pc.ticker} and do NOT set needsClarify to ask which stock they mean.`;
    case "research":
      return `The user is on the Research page${pc.label ? ` (${pc.label})` : ""}. Screening/idea questions here are "discover"; treat "these"/"the top names" as the shown ranked list and do NOT clarify which universe.`;
    case "watchlist":
      return `The user is viewing their "${pc.label ?? "watchlist"}" watchlist. Vague references ("these", "my list", "these names") are those tickers — route to "agent" for them and do NOT clarify which stocks.`;
    case "portfolio":
      return `The user is on their Portfolio page. "How am I doing?", "review these", or "my holdings" refer to their portfolio — route to "agent" and do NOT clarify which stocks.`;
  }
}
