// Quarterly financials + TTM three-statement summary for the stock page's
// Overview (trajectory mini-charts, quarterly ledger table, TTM columns).
// Read-only public filing data (same posture as the bundle/dcf routes): EDGAR
// XBRL quarterly frames + Finnhub quarterly EPS. Missing concepts are null —
// the UI renders "—", never an invented number (Data Accuracy Rule).

import { NextResponse } from "next/server";
import {
  getCikByTicker,
  getCompanyFacts,
  extractQuarterlyFundamentals,
  extractBalanceSnapshot,
  type QuarterlyMetric,
} from "@/lib/edgar";
import { getEarnings } from "@/lib/finnhub";
import { rateLimitGuard } from "@/lib/rateLimit";

export interface FinancialsQuarter {
  year: number;
  quarter: number; // calendar quarter 1-4
  revenue: number | null;
  revenueYoY: number | null; // fraction, e.g. 0.34
  epsDiluted: number | null;
  grossMargin: number | null; // fraction
  netIncome: number | null;
  fcf: number | null;
}

function ord(year: number, quarter: number): number {
  return year * 4 + (quarter - 1);
}

function toMap(series: QuarterlyMetric[]): Map<number, number> {
  return new Map(series.map((m) => [ord(m.year, m.quarter), m.value]));
}

/** Sum a series' last 4 quarters when they are consecutive; else null. */
function ttmSum(series: QuarterlyMetric[]): number | null {
  if (series.length < 4) return null;
  const last4 = series.slice(-4);
  const first = ord(last4[0].year, last4[0].quarter);
  const last = ord(last4[3].year, last4[3].quarter);
  if (last - first !== 3) return null;
  return last4.reduce((a, m) => a + m.value, 0);
}

interface EarningsEntry {
  actual?: number | null;
  period?: string; // fiscal-quarter end date "2026-06-27"
}

/** Map Finnhub EPS actuals onto calendar quarters by their period end date. */
function epsByQuarter(earnings: unknown): Map<number, number> {
  const out = new Map<number, number>();
  if (!Array.isArray(earnings)) return out;
  for (const e of earnings as EarningsEntry[]) {
    if (typeof e?.actual !== "number" || typeof e?.period !== "string") continue;
    const d = new Date(e.period);
    if (Number.isNaN(d.getTime())) continue;
    const q = Math.ceil((d.getUTCMonth() + 1) / 3);
    out.set(ord(d.getUTCFullYear(), q), e.actual);
  }
  return out;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = await rateLimitGuard(req, "stock-financials", {
    capacity: 20,
    refillPerSec: 0.5,
  });
  if (limited) return limited;

  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Missing ticker." }, { status: 400 });

  const cik = await getCikByTicker(symbol);
  if (!cik) {
    // ETFs / foreign issuers have no XBRL facts — no statement data.
    return NextResponse.json(
      { error: `Financial statements are unavailable for ${symbol} (no SEC filings).` },
      { status: 404 }
    );
  }

  try {
    const [facts, earnings] = await Promise.all([
      getCompanyFacts(cik),
      getEarnings(symbol).catch(() => null),
    ]);

    // 12 quarters extracted so the 8 shown can each compute YoY.
    const q = extractQuarterlyFundamentals(facts, 12);
    const revenue = toMap(q.revenue);
    const grossProfit = toMap(q.grossProfit);
    const costOfRevenue = toMap(q.costOfRevenue);
    const netIncome = toMap(q.netIncome);
    const ocf = toMap(q.operatingCashFlow);
    const capex = toMap(q.capex);
    const eps = epsByQuarter(earnings);

    // Revenue anchors the ledger rows; without any revenue quarters there is
    // nothing to build (404 → UI shows the unavailable state).
    if (q.revenue.length === 0) {
      return NextResponse.json(
        { error: `No quarterly filings found for ${symbol}.` },
        { status: 404 }
      );
    }

    let fcfIsProxy = false;
    const quarters: FinancialsQuarter[] = q.revenue.slice(-8).map((m) => {
      const o = ord(m.year, m.quarter);
      const rev = m.value;
      const priorRev = revenue.get(o - 4);
      const gp =
        grossProfit.get(o) ??
        (costOfRevenue.get(o) != null ? rev - costOfRevenue.get(o)! : null);
      const cf = ocf.get(o);
      let fcf: number | null = null;
      if (cf != null) {
        const cx = capex.get(o);
        if (cx != null) fcf = cf - cx;
        else {
          fcf = cf;
          fcfIsProxy = true;
        }
      }
      return {
        year: m.year,
        quarter: m.quarter,
        revenue: rev,
        revenueYoY: priorRev != null && priorRev > 0 ? rev / priorRev - 1 : null,
        epsDiluted: eps.get(o) ?? null,
        grossMargin: gp != null && rev > 0 ? gp / rev : null,
        netIncome: netIncome.get(o) ?? null,
        fcf,
      };
    });

    // ── TTM three-statement summary ───────────────────────────────────────────
    const revenueTTM = ttmSum(q.revenue);
    const grossProfitTTM = ttmSum(q.grossProfit);
    const operatingIncomeTTM = ttmSum(q.operatingIncome);
    const netIncomeTTM = ttmSum(q.netIncome);
    const ocfTTM = ttmSum(q.operatingCashFlow);
    const capexTTM = ttmSum(q.capex);
    const buybacksTTM = ttmSum(q.buybacks);
    const fcfTTM = ocfTTM != null ? ocfTTM - (capexTTM ?? 0) : null;

    // EPS TTM = sum of the 4 most recent quarterly actuals when we have 4.
    const epsVals = Array.from(eps.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-4)
      .map(([, v]) => v);
    const epsTTM = epsVals.length === 4 ? epsVals.reduce((a, b) => a + b, 0) : null;

    const balance = extractBalanceSnapshot(facts);
    const netCash =
      balance.cash != null && balance.totalDebt != null
        ? balance.cash - balance.totalDebt
        : null;
    const bookValuePerShare =
      balance.equity != null && balance.sharesOutstanding
        ? balance.equity / balance.sharesOutstanding
        : null;

    return NextResponse.json({
      ticker: symbol,
      quarters,
      fcfIsProxy,
      ttm: {
        income: {
          revenue: revenueTTM,
          grossProfit: grossProfitTTM,
          operatingIncome: operatingIncomeTTM,
          netIncome: netIncomeTTM,
          epsDiluted: epsTTM,
        },
        balance: {
          cash: balance.cash,
          totalDebt: balance.totalDebt,
          netCash,
          totalAssets: balance.totalAssets,
          bookValuePerShare,
          asOf: balance.asOf,
        },
        cashflow: {
          operatingCF: ocfTTM,
          capex: capexTTM,
          fcf: fcfTTM,
          buybacks: buybacksTTM,
          fcfMargin: fcfTTM != null && revenueTTM ? fcfTTM / revenueTTM : null,
        },
      },
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[stock financials]", symbol, err);
    return NextResponse.json(
      { error: `Couldn't load financials for ${symbol}.` },
      { status: 502 }
    );
  }
}
