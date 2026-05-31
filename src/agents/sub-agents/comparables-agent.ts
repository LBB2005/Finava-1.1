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
    epsAnnual?: number | null;
    bookValuePerShare?: number | null;
    fcfTTM?: number | null;
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
          peRatio: basic.metric.peBasicExclExtraTTM,
          pbRatio: basic.metric.pbQuarterly,
          psRatio: basic.metric.psTTM,
          evEbitda: basic.metric["ev/ebitda"],
          epsAnnual: basic.metric.epsAnnual,
          bookValuePerShare: basic.metric.bookValuePerShareAnnual,
          fcfTTM: basic.metric.fcfTTM,
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

For each ticker, compute and tabulate these multiples. Use pre-computed metrics where available; fall back to financials data otherwise:
1. **P/E** = Price / EPS (diluted annual)
2. **EV/EBITDA** = (Market Cap + Long-Term Debt − Cash) / (Operating Income + D&A). Market Cap ≈ Price × (Net Income / EPS) or use the metric directly.
3. **P/S** = Market Cap / Annual Revenue
4. **P/B** = Market Cap / Total Equity (or use pbRatio if available)
5. **FCF Yield %** = Free Cash Flow / Market Cap × 100. FCF = Operating Cash Flow + CapEx (CapEx is usually negative). If FCF is negative, output "N/A — negative FCF"

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
