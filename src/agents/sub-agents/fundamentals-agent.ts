/**
 * Multi-Year Fundamentals Agent
 * Builds a 3–5 year time series of revenue, earnings, margins, and FCF
 * using SEC EDGAR XBRL (primary) and Finnhub financials-reported (supplemental).
 * Outputs a trend analysis with inline charts for the CEO to reference.
 */

import { generate } from "@/lib/llm";
import { getSkillsPrompt } from "@/agents/skills";
import { getCikByTicker, getCompanyFacts, extractFundamentalTimeSeries } from "@/lib/edgar";
import { getFinancialsReported, getBasicFinancials } from "@/lib/finnhub";

function fmt(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function pct(a: number, b: number): string {
  if (!b) return "N/A";
  return `${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%`;
}

export async function runFundamentalsAgent(input: unknown): Promise<string> {
  const { ticker, years = 5 } = input as { ticker: string; years?: number };

  // ── 1. Fetch data in parallel ──────────────────────────────────────────────
  const [cik, fhFinancials, basicMetrics] = await Promise.allSettled([
    getCikByTicker(ticker),
    getFinancialsReported(ticker, "annual"),
    getBasicFinancials(ticker),
  ]);

  // EDGAR XBRL time series (needs CIK)
  let edgarSeries = null;
  const cikVal = cik.status === "fulfilled" ? cik.value : null;
  if (cikVal) {
    try {
      const facts = await getCompanyFacts(cikVal);
      edgarSeries = extractFundamentalTimeSeries(facts, years);
    } catch (err) {
      console.warn("[fundamentals-agent] EDGAR facts failed:", err);
    }
  }

  // ── 2. Build structured data summary ──────────────────────────────────────
  const sections: string[] = [];

  // EDGAR multi-year time series
  if (edgarSeries) {
    const { revenue, netIncome, operatingIncome, rAndD, operatingCashFlow, totalDebt, cash } = edgarSeries;

    if (revenue.length >= 2) {
      const rows = revenue.map((r) => `  ${r.year}: ${fmt(r.value)}`).join("\n");
      const cagr = revenue.length >= 2
        ? ` (${years}-yr CAGR: ${pct(revenue.at(-1)!.value, revenue[0].value)} total growth)`
        : "";
      sections.push(`Revenue (${revenue.length} years from EDGAR)${cagr}:\n${rows}`);
    }

    if (netIncome.length >= 2) {
      const rows = netIncome.map((r) => `  ${r.year}: ${fmt(r.value)}`).join("\n");
      sections.push(`Net Income:\n${rows}`);
    }

    if (operatingIncome.length >= 2) {
      const rows = operatingIncome.map((r) => `  ${r.year}: ${fmt(r.value)}`).join("\n");
      sections.push(`Operating Income:\n${rows}`);
    }

    if (operatingCashFlow.length >= 2) {
      const rows = operatingCashFlow.map((r) => `  ${r.year}: ${fmt(r.value)}`).join("\n");
      sections.push(`Operating Cash Flow:\n${rows}`);
    }

    if (rAndD.length >= 2) {
      const rows = rAndD.map((r) => `  ${r.year}: ${fmt(r.value)}`).join("\n");
      sections.push(`R&D Expense:\n${rows}`);
    }

    if (totalDebt.length >= 1 || cash.length >= 1) {
      const latestDebt = totalDebt.at(-1);
      const latestCash = cash.at(-1);
      sections.push(
        `Balance Sheet (latest):\n  Debt: ${latestDebt ? fmt(latestDebt.value) : "N/A"}\n  Cash: ${latestCash ? fmt(latestCash.value) : "N/A"}`
      );
    }
  }

  // Finnhub reported financials (multi-period backup / supplement)
  if (fhFinancials.status === "fulfilled") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reports: any[] = fhFinancials.value?.data ?? [];
    const annuals = reports.filter((r: { period: string }) => r.period === "annual").slice(0, years);
    if (annuals.length > 0 && !edgarSeries?.revenue.length) {
      // Use Finnhub as fallback revenue data
      const fhRevLines = annuals
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => {
          const rev = r.report?.ic?.find((item: { concept: string }) =>
            item.concept?.toLowerCase().includes("revenue")
          );
          return rev ? `  ${r.year}: ${fmt(rev.value)}` : null;
        })
        .filter(Boolean)
        .join("\n");
      if (fhRevLines) sections.push(`Revenue (Finnhub fallback):\n${fhRevLines}`);
    }
  }

  // Key ratios from Finnhub basic metrics
  if (basicMetrics.status === "fulfilled") {
    const m = basicMetrics.value?.metric ?? {};
    const ratioLines = [
      m.peNormalizedAnnual && `P/E (normalized): ${m.peNormalizedAnnual.toFixed(1)}x`,
      m.evEbitdaAnnual && `EV/EBITDA: ${m.evEbitdaAnnual.toFixed(1)}x`,
      m["10WeekPriceReturnDaily"] && `10-week return: ${m["10WeekPriceReturnDaily"].toFixed(1)}%`,
      m["52WeekPriceReturnDaily"] && `52-week return: ${m["52WeekPriceReturnDaily"].toFixed(1)}%`,
      m.roeTTM && `ROE (TTM): ${m.roeTTM.toFixed(1)}%`,
      m.roiTTM && `ROI (TTM): ${m.roiTTM.toFixed(1)}%`,
      m.grossMarginTTM && `Gross Margin (TTM): ${m.grossMarginTTM.toFixed(1)}%`,
      m.netProfitMarginTTM && `Net Margin (TTM): ${m.netProfitMarginTTM.toFixed(1)}%`,
      m.debtEquityAnnual && `Debt/Equity: ${m.debtEquityAnnual.toFixed(2)}x`,
      m.currentRatioAnnual && `Current Ratio: ${m.currentRatioAnnual.toFixed(2)}`,
    ]
      .filter(Boolean)
      .join("\n  ");
    if (ratioLines) sections.push(`Current Ratios & Returns:\n  ${ratioLines}`);
  }

  if (!sections.length) {
    return `Unable to retrieve multi-year fundamental data for ${ticker}. The company may not file with SEC EDGAR or data may be unavailable.`;
  }

  const rawData = sections.join("\n\n");

  // ── 3. Build chart data from revenue + earnings time series ───────────────
  const charts: object[] = [];

  if (edgarSeries?.revenue.length && edgarSeries.revenue.length >= 2) {
    charts.push({
      type: "line",
      title: `${ticker} Revenue Trend`,
      description: "Annual revenue from SEC EDGAR (GAAP)",
      unit: "$",
      data: edgarSeries.revenue.map((r) => ({
        name: String(r.year),
        value: Math.round(r.value / 1e6), // in millions
      })),
    });
  }

  if (edgarSeries?.netIncome.length && edgarSeries.netIncome.length >= 2) {
    charts.push({
      type: "bar",
      title: `${ticker} Net Income Trend`,
      description: "Annual net income from SEC EDGAR (GAAP)",
      unit: "$",
      data: edgarSeries.netIncome.map((r) => ({
        name: String(r.year),
        value: Math.round(r.value / 1e6),
      })),
    });
  }

  const chartBlock =
    charts.length > 0
      ? charts.map((c) => `\`\`\`chart\n${JSON.stringify(c, null, 2)}\n\`\`\``).join("\n\n") + "\n\n"
      : "";

  // ── 4. Ask the model to write the trend analysis ──────────────────────────
  const analysis = await generate({
    agent: "fundamentals",
    system: getSkillsPrompt("fundamentals"),
    maxTokens: 1800,
    prompt: `You are a fundamental equity analyst. Analyze the multi-year financial trends for ${ticker} and write a concise, insightful report.

## Raw Data
${rawData}

## Instructions
1. Summarize the revenue and earnings trajectory — is growth accelerating, decelerating, or flat?
2. Comment on margin trends (expanding, compressing, stable)
3. Assess balance sheet health (debt load, cash position, leverage trend)
4. Flag any concerning patterns (declining FCF, rising debt, shrinking margins)
5. End with a "Fundamental Trend Verdict" (Improving / Stable / Deteriorating) and why

Be specific with numbers. Use the years provided. Do NOT hallucinate data not in the raw input.`,
  });

  return `${chartBlock}${analysis}`;
}
