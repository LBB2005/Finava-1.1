import { generate } from "@/lib/llm";
import { getFinancials } from "@/lib/polygon";
import { getSkillsPrompt } from "@/agents/skills";
import { getBasicFinancials, getQuote } from "@/lib/finnhub";

interface GrahamInput {
  ticker: string;
}

export async function runGrahamAgent(input: unknown): Promise<string> {
  const { ticker } = input as GrahamInput;

  const [basicRes, financialsRes, quoteRes] = await Promise.allSettled([
    getBasicFinancials(ticker),
    getFinancials(ticker),
    getQuote(ticker),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const basic: any = basicRes.status === "fulfilled" ? basicRes.value : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fin: any =
    financialsRes.status === "fulfilled"
      ? financialsRes.value?.results?.[0]?.financials
      : null;
  const currentPrice =
    quoteRes.status === "fulfilled" ? quoteRes.value?.price : null;

  const metrics = basic?.metric ?? null;
  const incomeStmt = fin?.income_statement ?? null;
  const balanceSheet = fin?.balance_sheet ?? null;

  const rawData = {
    ticker,
    currentPrice,
    // Pre-computed metrics from Finnhub
    peRatio: metrics?.peBasicExclExtraTTM ?? null,
    pbRatio: metrics?.pbQuarterly ?? null,
    epsAnnual: metrics?.epsAnnual ?? null,
    bookValuePerShare: metrics?.bookValuePerShareAnnual ?? null,
    debtToEquity: metrics?.totalDebt_totalEquityAnnual ?? null,
    currentRatio: metrics?.currentRatioAnnual ?? null,
    // From Polygon financials (fallback)
    eps: incomeStmt?.diluted_earnings_per_share?.value ?? null,
    totalEquity: balanceSheet?.equity?.value ?? null,
    totalLiabilities: balanceSheet?.liabilities?.value ?? null,
    currentAssets: balanceSheet?.current_assets?.value ?? null,
    currentLiabilities: balanceSheet?.current_liabilities?.value ?? null,
    totalDebt: balanceSheet?.long_term_debt?.value ?? null,
  };

  const text = await generate({
    agent: "graham",
    system: getSkillsPrompt("graham"),
    maxTokens: 2000,
    prompt: `You are a value investor applying Benjamin Graham's defensive investment criteria to **${ticker}**.

Raw data:
\`\`\`json
${JSON.stringify(rawData, null, 2)}
\`\`\`

Perform ALL of the following checks. Use pre-computed metrics where available; fall back to the Polygon financials fields otherwise.

**Criteria:**
1. **Graham Number**: √(22.5 × EPS × Book Value per Share). Compare to current price → state whether undervalued or overvalued and by how much %.
2. **Margin of Safety**: (Graham Number − Current Price) / Graham Number × 100. Positive = undervalued buffer.
3. **P/E Ratio**: Pass if P/E < 15.
4. **P/B Ratio**: Pass if P/B < 1.5.
5. **Combined P/E × P/B**: Pass if product < 22.5.
6. **Debt-to-Equity**: Pass if D/E ≤ 0.5 (conservative). Flag if > 1.0 as high risk.
7. **Current Ratio**: Pass if Current Assets / Current Liabilities > 2.0.
8. **Overall Score**: Count how many of criteria 3–7 pass (max 5). State overall verdict: Strong Buy / Cautious / Avoid.

**Output format:**
1. A markdown table with columns: | Criterion | Value | Threshold | Pass/Fail |
2. The Graham Number and Margin of Safety as a callout block (> blockquote).
3. Overall score (X/5) and a 2-sentence verdict on whether Graham would buy this stock.

Use "N/A" for any criterion that cannot be calculated. If data is too sparse to run the screen, say so clearly.`,
  });

  return text || "Graham screen data unavailable.";
}
