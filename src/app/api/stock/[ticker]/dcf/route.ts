// Base inputs for the interactive DCF tab. Read-only market/filing data (same
// public posture as the bundle GET route) — the client recomputes fair value
// locally as the user drags the WACC / growth sliders, so nothing here is gated
// or LLM-backed.

import { NextResponse } from "next/server";
import {
  getCikByTicker,
  getCompanyFacts,
  extractFinancialMetrics,
  extractFundamentalTimeSeries,
} from "@/lib/edgar";
import { getQuote, getCompanyProfile } from "@/lib/finnhub";
import { suggestedWaccFromBeta, type DcfInputs } from "@/lib/dcf";
import { getBasicFinancials } from "@/lib/finnhub";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Revenue CAGR over the available annual series, as a fraction. */
function revenueCagr(series: { year: number; value: number }[]): number | null {
  if (series.length < 2) return null;
  const first = series[0].value;
  const last = series[series.length - 1].value;
  const periods = series.length - 1;
  if (first <= 0 || last <= 0) return null;
  return Math.pow(last / first, 1 / periods) - 1;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Missing ticker." }, { status: 400 });

  const cik = await getCikByTicker(symbol);
  if (!cik) {
    // ETFs, foreign issuers and the like have no CIK / XBRL facts — no DCF.
    return NextResponse.json(
      { error: `DCF is unavailable for ${symbol} (no SEC filings).` },
      { status: 404 }
    );
  }

  try {
    const [facts, quote, profile, basics] = await Promise.all([
      getCompanyFacts(cik),
      getQuote(symbol).catch(() => null),
      getCompanyProfile(symbol).catch(() => null),
      getBasicFinancials(symbol).catch(() => null),
    ]);

    const m = extractFinancialMetrics(facts);
    const series = extractFundamentalTimeSeries(facts, 6);

    // Free cash flow = operating cash flow − capex. Capex is frequently missing on
    // EDGAR; fall back to operating cash flow and flag it as a proxy.
    const ocf = num(m.operatingCashFlow);
    const capex = num(m.capex);
    const fcfIsProxy = capex == null;
    const baseFcf = ocf != null ? (capex != null ? ocf - capex : ocf) : null;

    const totalDebt = num(m.totalDebt) ?? 0;
    const cash = num(m.cash) ?? 0;
    const netDebt = totalDebt - cash;

    // Shares: prefer EDGAR; fall back to marketCap/price when absent.
    const price = num((quote as { price?: number } | null)?.price);
    const mcapMillions = num(
      (basics as { metric?: Record<string, unknown> } | null)?.metric?.marketCapitalization
    );
    let shares = num(m.sharesOutstanding);
    if ((!shares || shares <= 0) && mcapMillions && price && price > 0) {
      shares = (mcapMillions * 1e6) / price;
    }

    const beta = num(
      (basics as { metric?: Record<string, unknown> } | null)?.metric?.beta
    );

    const inputs: DcfInputs = {
      baseFcf,
      fcfIsProxy,
      sharesOutstanding: shares && shares > 0 ? shares : null,
      netDebt,
      historicalGrowth: revenueCagr(series.revenue),
      suggestedWacc: suggestedWaccFromBeta(beta),
      currentPrice: price,
      currency: (profile as { currency?: string } | null)?.currency ?? "USD",
    };

    if (inputs.baseFcf == null) {
      return NextResponse.json(
        { error: `DCF is unavailable for ${symbol} (no cash-flow data).` },
        { status: 404 }
      );
    }

    return NextResponse.json({ ticker: symbol, inputs });
  } catch (err) {
    console.error("[stock dcf]", symbol, err);
    return NextResponse.json({ error: "Failed to build DCF inputs." }, { status: 500 });
  }
}
