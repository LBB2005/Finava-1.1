import { generate } from "@/lib/llm";
import { getFinancialsReported, getBasicFinancials, getSnapshots } from "@/lib/finnhub";
import { getSkillsPrompt } from "@/agents/skills";

function runDCF(fcf: number, growthRate: number, terminalGrowthRate: number, wacc: number, years = 10) {
  let pv = 0;
  let f = fcf;
  for (let i = 1; i <= years; i++) {
    f *= 1 + growthRate;
    pv += f / (1 + wacc) ** i;
  }
  const tv = (f * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
  pv += tv / (1 + wacc) ** years;
  return pv;
}

export async function runDcfAgent(input: unknown): Promise<string> {
  const { ticker, wacc = 0.10, growthRate: terminalGrowth = 0.025 } = input as {
    ticker: string; wacc?: number; growthRate?: number;
  };

  let summary = "Financial data unavailable.";

  if (process.env.FINNHUB_API_KEY) {
    try {
      const [metrics, financials, snaps] = await Promise.all([
        getBasicFinancials(ticker),
        getFinancialsReported(ticker, "annual"),
        getSnapshots([ticker]),
      ]);

      const m = metrics.metric ?? {};
      const currentPrice = snaps[0]?.price ?? 0;

       
      const latestReport = (financials.data ?? [])[0]?.report ?? {};
      // Finnhub returns these as arrays; guard so a missing/object value can't throw
      // (.find on {}) and silently nuke the whole valuation.
      const cf = Array.isArray(latestReport.cf) ? latestReport.cf : [];
      const ic = Array.isArray(latestReport.ic) ? latestReport.ic : [];

      const operatingCF = cf.find((x: { concept: string }) => x.concept === "NetCashProvidedByUsedInOperatingActivities")?.value ?? 0;
      const capex = Math.abs(cf.find((x: { concept: string }) => x.concept === "PaymentsToAcquirePropertyPlantAndEquipment")?.value ?? 0);
      const fcf = operatingCF - capex;

      const revenue =
        ic.find((x: { concept: string }) => x.concept === "Revenues")?.value ??
        ic.find((x: { concept: string }) => x.concept === "RevenueFromContractWithCustomerExcludingAssessedTax")?.value ??
        ic.find((x: { concept: string }) => typeof x.concept === "string" && x.concept.toLowerCase().startsWith("revenue"))?.value ??
        0;
      const netIncome =
        ic.find((x: { concept: string }) => x.concept === "NetIncomeLoss")?.value ??
        ic.find((x: { concept: string }) => x.concept === "NetIncomeLossAttributableToParentEntity")?.value ??
        0;

      // Never default share count to 1 — that turns enterprise value into a bogus
      // per-share figure. Leave the per-share estimate null when shares are unknown.
      const sharesOutstanding =
        typeof m["shareOutstanding"] === "number" && m["shareOutstanding"] > 0
          ? m["shareOutstanding"]
          : 0;
      let dcfPerShare: number | null = null;
      if (fcf > 0 && sharesOutstanding > 0) {
        const ev = runDCF(fcf, 0.07, terminalGrowth, wacc);
        dcfPerShare = ev / sharesOutstanding;
      }

      summary = JSON.stringify({
        ticker,
        currentPrice,
        revenue: revenue ? `$${(revenue / 1e9).toFixed(2)}B` : "N/A",
        netIncome: netIncome ? `$${(netIncome / 1e9).toFixed(2)}B` : "N/A",
        freeCashFlow: fcf ? `$${(fcf / 1e9).toFixed(2)}B` : "N/A",
        peRatio: m["peBasicExclExtraTTM"] ?? "N/A",
        evEbitda: m["currentEv/freeCashFlowAnnual"] ?? "N/A",
        revenueGrowth: m["revenueGrowth5Y"] != null ? `${(m["revenueGrowth5Y"]).toFixed(1)}%` : "N/A",
        grossMargin: m["grossMarginTTM"] ? `${(m["grossMarginTTM"]).toFixed(1)}%` : "N/A",
        dcfEstimatePerShare: dcfPerShare
          ? `$${dcfPerShare.toFixed(2)}`
          : fcf <= 0
            ? "Negative FCF — cannot model"
            : "Insufficient data (missing share count) — cannot model",
        impliedUpside: dcfPerShare && currentPrice > 0
          ? `${(((dcfPerShare - currentPrice) / currentPrice) * 100).toFixed(1)}%`
          : "N/A",
        assumptions: { wacc: `${(wacc * 100).toFixed(1)}%`, terminalGrowth: `${(terminalGrowth * 100).toFixed(1)}%` },
      }, null, 2);
    } catch {
      summary = `Could not fetch financials for ${ticker}.`;
    }
  }

  const text = await generate({
    agent: "dcf",
    system: getSkillsPrompt("dcf"),
    maxTokens: 10000,
    reasoning: 8000,
    cache: true,
    prompt: `Perform a DCF valuation for ${ticker}.\n\n${summary}\n\nProvide: financial health summary, DCF assumption assessment, fair value range (bear/base/bull), valuation risks, and buy/hold/sell signal vs current price. Note: not financial advice.`,
  });

  return text || "DCF unavailable.";
}
