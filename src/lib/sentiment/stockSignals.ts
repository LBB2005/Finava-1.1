/* ============================================================
   Finava · Sentiment — STOCK tier signal provider
   ------------------------------------------------------------
   Fetches the four stock-tier signals in parallel and returns them as
   normalized SignalInputs for the shared combiner. Every fetch is
   failure-isolated: on error the signal is emitted with confidence 0
   so it drops out of the composite and its weight redistributes.

     Analyst trend  35%  Finnhub recommendation skew
     Put/Call       23%  Polygon options snapshot
     News           17%  Finnhub /news-sentiment
     Grok / X       25%  xAI live X search (degraded → confidence 0)

   Reddit was removed (public JSON is 403-blocked on datacenter IPs); its
   weight was rebalanced into Grok to preserve a retail/crowd read. See
   sentiment/reddit.ts for the dormant client + Apify upgrade path.
   ============================================================ */

import { getRecommendationTrends, getNewsSentiment } from "@/lib/finnhub";
import { getOptionsSnapshot } from "@/lib/polygon";
import { getGrokSentiment } from "./grok";
import {
  type SignalInput,
  normPutCall,
  normAnalystSkew,
  normNewsTone,
  confFromCount,
} from "./core";

// ── shared raw fetchers (reused by sector/market providers) ──────────────────

/** Latest analyst rating skew in [-1,+1], or null if no coverage. */
export async function fetchAnalystSkew(ticker: string): Promise<number | null> {
  try {
    const rec = await getRecommendationTrends(ticker);
    if (Array.isArray(rec) && rec.length) {
      const r = rec[0] as Record<string, number>;
      const sb = r.strongBuy ?? 0,
        b = r.buy ?? 0,
        s = r.sell ?? 0,
        ss = r.strongSell ?? 0;
      const total = sb + b + (r.hold ?? 0) + s + ss;
      if (total > 0) return (2 * sb + b - s - 2 * ss) / (2 * total);
    }
  } catch {
    /* rate-limited or unknown symbol */
  }
  return null;
}

/** Open-interest put/call ratio from an options snapshot, or null. Works for
 *  single stocks, sector ETFs (XLK…) and SPY alike. */
export async function fetchPutCall(ticker: string): Promise<number | null> {
  try {
    const data = (await getOptionsSnapshot(ticker)) as {
      results?: { details?: { contract_type?: string }; open_interest?: number }[];
    };
    let callOI = 0;
    let putOI = 0;
    for (const c of data.results ?? []) {
      const oi = c.open_interest ?? 0;
      if (c.details?.contract_type === "call") callOI += oi;
      else if (c.details?.contract_type === "put") putOI += oi;
    }
    if (callOI > 0) return putOI / callOI;
  } catch {
    /* no key / paid-tier gate / unknown symbol */
  }
  return null;
}

// ── stock-tier weights ───────────────────────────────────────────────────────
const W = { analyst: 0.35, putCall: 0.23, news: 0.17, grok: 0.25 } as const;

export async function gatherStockSignals(
  ticker: string,
  companyName?: string
): Promise<SignalInput[]> {
  const [skew, putCall, news, grok] = await Promise.all([
    fetchAnalystSkew(ticker),
    fetchPutCall(ticker),
    getNewsSentiment(ticker).catch(() => null),
    getGrokSentiment(ticker, companyName).catch(() => null),
  ]);

  const signals: SignalInput[] = [];

  // Analyst trend
  signals.push({
    key: "analyst",
    label: "Analyst trend",
    score: skew != null ? normAnalystSkew(skew) : 0,
    weight: W.analyst,
    confidence: skew != null ? 1 : 0,
    detail: skew != null ? `Rating skew ${skew >= 0 ? "+" : ""}${skew.toFixed(2)} (−1 sell … +1 strong buy).` : "No analyst coverage.",
    raw: { skew },
  });

  // Put/Call ratio
  signals.push({
    key: "putCall",
    label: "Options put/call",
    score: putCall != null ? normPutCall(putCall) : 0,
    weight: W.putCall,
    confidence: putCall != null ? 1 : 0,
    detail: putCall != null ? `Put/call OI ratio ${putCall.toFixed(2)} (lower = more bullish).` : "No options data.",
    raw: { putCall },
  });

  // Finnhub news sentiment
  signals.push({
    key: "news",
    label: "News sentiment",
    score: news ? normNewsTone(news.bullishPercent, news.bearishPercent) : 0,
    weight: W.news,
    confidence: news ? confFromCount(news.articlesInLastWeek, 100) : 0,
    detail: news
      ? `${Math.round(news.bullishPercent * 100)}% bullish / ${Math.round(
          news.bearishPercent * 100
        )}% bearish across ${news.articlesInLastWeek} articles.`
      : "No news-sentiment data.",
    raw: news ? { ...news } : undefined,
  });

  // Grok / X (degraded → confidence 0)
  signals.push({
    key: "grokX",
    label: "X / Twitter (Grok)",
    score: grok ? grok.score : 0,
    weight: W.grok,
    confidence: grok ? grok.confidence : 0,
    detail: grok ? grok.detail : "X search unavailable (no XAI key).",
    raw: grok ? { foundPosts: grok.foundPosts, degraded: grok.degraded, citations: grok.citations } : undefined,
  });

  return signals;
}
