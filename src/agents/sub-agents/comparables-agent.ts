import { generate } from "@/lib/llm";
import { getFinancials } from "@/lib/polygon";
import { getSkillsPrompt } from "@/agents/skills";
import { getBasicFinancials, getQuote, getPeers } from "@/lib/finnhub";

interface ComparablesInput {
  ticker: string;
  peers?: string[];
}

interface TickerData {
  ticker: string;
  currentPrice: number | null;
  metrics: {
    peRatio?: number | null;
    pbRatio?: number | null;
    psRatio?: number | null;
    evEbitda?: number | null;
    evRevenue?: number | null;
    epsAnnual?: number | null;
    bookValuePerShare?: number | null;
    fcfYieldPct?: number | null;
  } | null;
  financials: {
    revenue?: number | null;
    operatingIncome?: number | null;
    netIncome?: number | null;
    eps?: number | null;
    da?: number | null;
    totalEquity?: number | null;
    totalLiabilities?: number | null;
    currentLiabilities?: number | null;
    cash?: number | null;
    operatingCashFlow?: number | null;
    capex?: number | null;
  } | null;
}

export async function runComparablesAgent(input: unknown): Promise<string> {
  const { ticker, peers: inputPeers } = input as ComparablesInput;

  // Resolve peers if not provided
  let peers: string[] = inputPeers ?? [];
  if (peers.length === 0) {
    try {
      const peerData = await getPeers(ticker);
      peers = (peerData as string[]).filter((p) => p !== ticker).slice(0, 4);
    } catch {
      peers = [];
    }
  }

  const allTickers = [ticker, ...peers];

  const results = await Promise.allSettled(
    allTickers.map(async (t): Promise<TickerData> => {
      const [basicRes, financialsRes, quoteRes] = await Promise.allSettled([
        getBasicFinancials(t),
        getFinancials(t),
        getQuote(t),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const basic: any = basicRes.status === "fulfilled" ? basicRes.value : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fin: any = financialsRes.status === "fulfilled"
        ? financialsRes.value?.results?.[0]?.financials
        : null;

      return {
        ticker: t,
        currentPrice: quoteRes.status === "fulfilled" ? quoteRes.value.price : null,
        metrics: basic?.metric ? {
          peRatio: basic.metric.peTTM ?? basic.metric.peBasicExclExtraTTM ?? null,
          pbRatio: basic.metric.pbQuarterly ?? basic.metric.pbAnnual ?? null,
          psRatio: basic.metric.psTTM ?? basic.metric.psAnnual ?? null,
          evEbitda: basic.metric.evEbitdaTTM ?? null,
          evRevenue: basic.metric.evRevenueTTM ?? null,
          epsAnnual: basic.metric.epsTTM ?? basic.metric.epsAnnual ?? null,
          bookValuePerShare: basic.metric.bookValuePerShareAnnual ?? null,
          // FCF yield = FCF / Market Cap = 1 / (Price-to-FCF-per-share). Finnhub
          // exposes P/FCF (pfcfShareTTM) directly; there is no raw fcfTTM key.
          fcfYieldPct:
            typeof basic.metric.pfcfShareTTM === "number" && basic.metric.pfcfShareTTM > 0
              ? 100 / basic.metric.pfcfShareTTM
              : null,
        } : null,
        financials: fin ? {
          revenue: fin.income_statement?.revenues?.value,
          operatingIncome: fin.income_statement?.operating_income_loss?.value,
          netIncome: fin.income_statement?.net_income_loss?.value,
          eps: fin.income_statement?.diluted_earnings_per_share?.value,
          da: fin.income_statement?.depreciation_and_amortization?.value,
          totalEquity: fin.balance_sheet?.equity?.value,
          totalLiabilities: fin.balance_sheet?.liabilities?.value,
          currentLiabilities: fin.balance_sheet?.current_liabilities?.value,
          cash: fin.balance_sheet?.cash_and_equivalents_at_carrying_value?.value,
          operatingCashFlow: fin.cash_flow_statement?.net_cash_flow_from_operating_activities?.value,
          capex: fin.cash_flow_statement?.capital_expenditure?.value,
        } : null,
      };
    })
  );

  const data = results
    .filter((r): r is PromiseFulfilledResult<TickerData> => r.status === "fulfilled")
    .map((r) => r.value);

  const text = await generate({
    agent: "comparables",
    system: getSkillsPrompt("comparables"),
    maxTokens: 2000,
    prompt: `You are a financial analyst computing valuation multiples for a comparables analysis.

Target: **${ticker}**
Peers: ${peers.join(", ") || "none found"}

Each ticker's \`metrics\` block holds pre-computed TTM multiples from the data provider — PREFER these directly; only fall back to computing from \`financials\` when a metric is null:
1. **P/E** → \`metrics.peRatio\` (TTM). Fallback: Price / EPS.
2. **EV/EBITDA** → \`metrics.evEbitda\` (TTM, already enterprise-value based). Fallback: (Market Cap + Total Debt − Cash) / (Operating Income + D&A).
3. **P/S** → \`metrics.psRatio\` (TTM). Fallback: Market Cap / Annual Revenue.
4. **P/B** → \`metrics.pbRatio\`. Fallback: Market Cap / Total Equity.
5. **FCF Yield %** → \`metrics.fcfYieldPct\` (already a percentage, e.g. 2.96 = 2.96%). Fallback: (Operating Cash Flow + CapEx) / Market Cap × 100. If null and FCF computes negative, output "N/A — negative FCF".

Raw data:
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

Output:
1. A markdown table: | Ticker | P/E | EV/EBITDA | P/S | P/B | FCF Yield |
2. Peer median for each metric
3. For **${ticker}** specifically: a 2-3 sentence verdict — cheap / fairly valued / expensive vs peers on each metric, with the key reason.
Use "N/A" for any metric that cannot be calculated from available data.`,
  });

  return text || "Comparables data unavailable.";
}
