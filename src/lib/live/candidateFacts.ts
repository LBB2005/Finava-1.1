// The security-level facts the mandate's rails need, gathered per candidate.
//
// Every field is nullable and a null means "we could not verify this", never
// zero. That distinction is the whole file: a null market cap must fail the
// $2bn floor (we cannot show the name is eligible), whereas a zero would fail it
// for the wrong reason and read in the log as a fact we established. The rails
// in mandate.ts are written to treat null as not-verified, so the honest value
// has to survive all the way to them.

import { getQuote, getBasicFinancials, getEarningsCalendar } from "@/lib/finnhub";
import { getFactorUniverse } from "@/lib/factorUniverse";
import { logger } from "@/lib/logger";
import type { CandidateFacts } from "./mandate";

const log = logger("live:facts");

export interface CandidateFactsWithGaps extends CandidateFacts {
  dataGaps: { field: string; status: "unavailable" | "failed"; source: string }[];
}

/** ETFs the mandate excludes outright. Leveraged/inverse names are not the book's game. */
const LEVERAGED_INVERSE = /^(TQQQ|SQQQ|SPXL|SPXS|UPRO|SDOW|UDOW|TNA|TZA|SOXL|SOXS|LABU|LABD|YINN|YANG|NUGT|DUST|BOIL|KOLD|UVXY|SVXY|VIXY)$/i;

export async function candidateFacts(ticker: string): Promise<CandidateFactsWithGaps> {
  const symbol = ticker.toUpperCase();
  const dataGaps: CandidateFactsWithGaps["dataGaps"] = [];

  const [financials, quote, earnings, universe] = await Promise.allSettled([
    getBasicFinancials(symbol),
    getQuote(symbol),
    // Finnhub's calendar is a date-range query; the blackout rail only cares
    // about the next report, so a 90-day window is ample and keeps the payload small.
    getEarningsCalendar(today(), plusDays(90), symbol),
    getFactorUniverse(),
  ]);

  function gap(field: string, source: string, settled: PromiseSettledResult<unknown>) {
    if (settled.status === "rejected") {
      dataGaps.push({ field, status: "failed", source });
      log.warn("candidate fact fetch failed", { symbol, field });
      return true;
    }
    return false;
  }

  const fin: Record<string, unknown> | null =
    (financials.status === "fulfilled"
      ? (financials.value as { metric?: Record<string, unknown> })?.metric
      : null) ?? null;
  gap("marketCapUsd", "finnhub_basic_financials", financials);

  const marketCapUsd = numOrNull(fin?.marketCapitalization);
  // Finnhub reports market cap in millions.
  const marketCap = marketCapUsd === null ? null : marketCapUsd * 1e6;
  if (marketCap === null && financials.status === "fulfilled") {
    dataGaps.push({ field: "marketCapUsd", status: "unavailable", source: "finnhub_basic_financials" });
  }

  const price = quote.status === "fulfilled" ? numOrNull(quote.value.price) : null;
  gap("price", "alpaca_snapshot", quote);

  // Finnhub's key is "10DayAverageTradingVolume", reported in MILLIONS of
  // shares — not "avgVolume10Day", which does not exist and silently returned
  // undefined. That made dollar volume null for every candidate, so the ADV rail
  // could never be verified and NVDA was rejected for insufficient liquidity.
  // A rail that refuses everything looks exactly like a rail that is working.
  const avgVolumeShares = numOrNull(fin?.["10DayAverageTradingVolume"]);
  const avgDollarVolumeUsd =
    avgVolumeShares !== null && price !== null ? avgVolumeShares * 1e6 * price : null;
  if (avgDollarVolumeUsd === null && financials.status === "fulfilled") {
    dataGaps.push({
      field: "avgDollarVolumeUsd",
      status: "unavailable",
      source: "finnhub_basic_financials",
    });
  }

  const daysToNextEarnings =
    earnings.status === "fulfilled" ? daysUntilNextReport(earnings.value) : null;
  gap("daysToNextEarnings", "finnhub_earnings_calendar", earnings);

  // Sector drives the concentration rail, so an unresolved one must stay null
  // rather than defaulting to anything — the rail refuses on null by design.
  const sector =
    universe.status === "fulfilled"
      ? (universe.value.stocks.find((st) => st.ticker?.toUpperCase() === symbol)?.sector ?? null)
      : null;
  if (!sector) {
    dataGaps.push({
      field: "sector",
      status: universe.status === "fulfilled" ? "unavailable" : "failed",
      source: "factor_universe",
    });
  }

  return {
    ticker: symbol,
    side: "long",
    sector,
    marketCapUsd: marketCap,
    avgDollarVolumeUsd,
    // Finnhub's basic-financials payload carries NO short-interest field. Left
    // null deliberately rather than faked: the short rails then refuse every
    // short entry, which is the correct behaviour for a book that cannot verify
    // the constraint it declared. Shorts stay effectively disabled until a real
    // short-interest source is wired in — stated here so that is a known
    // position rather than a silent one.
    shortInterestPct: numOrNull(fin?.shortInterestPct),
    daysToNextEarnings,
    // The scout universe is US-listed by construction, so this is true unless a
    // ticker arrives from somewhere else; it stays an explicit field so the rail
    // is checked rather than assumed.
    usListed: true,
    isLeveragedOrInverseEtf: LEVERAGED_INVERSE.test(symbol),
    isOption: symbol.length > 6,
    dataGaps,
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Calendar days until the soonest scheduled report in the window.
 *
 * Null when Finnhub lists nothing — which the blackout rail reads as "no
 * earnings imminent". That is the one place this file's null-means-unverified
 * discipline is knowingly relaxed: an empty calendar genuinely is the normal
 * case for most names on most days, and treating it as unverified would block
 * every entry the book ever wanted to make.
 */
function daysUntilNextReport(payload: unknown): number | null {
  const rows = (payload as { earningsCalendar?: { date?: string }[] })?.earningsCalendar;
  if (!Array.isArray(rows) || !rows.length) return null;
  const times = rows
    .map((r) => Date.parse(`${r.date}T00:00:00Z`))
    .filter((t) => Number.isFinite(t) && t >= Date.now() - 86_400_000);
  if (!times.length) return null;
  return Math.ceil((Math.min(...times) - Date.now()) / 86_400_000);
}
