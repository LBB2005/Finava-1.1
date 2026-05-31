/**
 * Insider Agent v2
 * Combines two data sources:
 *   A) SEC EDGAR full-text search for Form 4 filings (last 48h)
 *      — filters purchases (type P) only, > $100K threshold, ranked by value
 *   B) Finnhub insider transactions (last 90 days) — for broader context
 */

import { generate } from "@/lib/llm";
import { getSkillsPrompt } from "@/agents/skills";
import { getInsiderTransactions } from "@/lib/finnhub";
import { searchRecentForm4, type Form4Filing } from "@/lib/edgar";

const USER_AGENT = "Lucra App liamblackshawbrown@gmail.com";

interface RecentPurchase {
  ticker: string;
  insiderName: string;
  title?: string;
  shares: number;
  price: number;
  totalValue: number;
  isNewPosition: boolean;
  filedAt: string;
  periodOfReport: string;
}

/**
 * Parse an EDGAR Form 4 filing XML to extract purchase transactions.
 * Returns null if no qualifying purchases found.
 */
async function parseForm4Purchases(
  accessionNo: string,
  cik: string,
  filedAt: string,
  periodOfReport: string,
  entityName: string,
  ticker: string
): Promise<RecentPurchase[]> {
  if (!accessionNo || !cik) return [];

  try {
    const formattedCik = cik.padStart(10, "0");

    // Try to get the filing index to find the actual XML
    const indexUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${formattedCik}&type=4&dateb=&owner=include&count=5&search_text=&output=atom`;
    const indexRes = await fetch(indexUrl, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!indexRes.ok) return [];
    const indexText = await indexRes.text();

    // Extract the first filing URL from Atom feed
    const linkMatch = indexText.match(/<link[^>]+href="(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/[^"]+\.xml)"/i);
    if (!linkMatch) return [];

    const xmlUrl = linkMatch[1];
    const xmlRes = await fetch(xmlUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!xmlRes.ok) return [];
    const xml = await xmlRes.text();

    // Parse non-derivative transactions
    const results: RecentPurchase[] = [];

    // Extract reporter name + title
    const nameMatch = xml.match(/<rptOwnerName>([^<]+)<\/rptOwnerName>/);
    const titleMatch = xml.match(/<officerTitle>([^<]+)<\/officerTitle>/);
    const insiderName = nameMatch?.[1]?.trim() ?? entityName;
    const title = titleMatch?.[1]?.trim();

    // Find all nonDerivativeTransaction blocks
    const txBlocks = xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/g) ?? [];

    for (const block of txBlocks) {
      const typeMatch = block.match(/<transactionCode>([^<]+)<\/transactionCode>/);
      const adMatch = block.match(/<transactionAcquiredDisposedCode>\s*<value>([^<]+)<\/value>/);
      const sharesMatch = block.match(/<transactionShares>\s*<value>([^<]+)<\/value>/);
      const priceMatch = block.match(/<transactionPricePerShare>\s*<value>([^<]+)<\/value>/);
      const ownedMatch = block.match(/<sharesOwnedFollowingTransaction>\s*<value>([^<]+)<\/value>/);

      const txType = typeMatch?.[1]?.trim();
      const adCode = adMatch?.[1]?.trim();
      const shares = parseFloat(sharesMatch?.[1] ?? "0");
      const price = parseFloat(priceMatch?.[1] ?? "0");
      const ownedAfter = parseFloat(ownedMatch?.[1] ?? "0");

      // Only purchases (P) with acquired code (A) where value > $100K
      if (txType !== "P" && adCode !== "A") continue;
      if (!shares || !price) continue;
      const totalValue = shares * price;
      if (totalValue < 100_000) continue;

      // Approximate "new position" = shares acquired ≥ 80% of total shares held after
      const isNewPosition = ownedAfter > 0 && shares / ownedAfter >= 0.8;

      results.push({
        ticker,
        insiderName,
        title,
        shares,
        price,
        totalValue,
        isNewPosition,
        filedAt,
        periodOfReport,
      });
    }

    return results;
  } catch {
    return [];
  }
}

export async function runInsiderAgent(input: unknown): Promise<string> {
  const { tickers } = input as { tickers: string[] };

  const sections: string[] = [];

  // ── A. EDGAR Form 4 recent purchases (last 48h, >$100K) ──────────────────
  const recentPurchases: RecentPurchase[] = [];
  // Tickers whose EDGAR lookup itself failed (network/HTTP), as opposed to
  // returning zero filings. We must not report a failed lookup as "no activity."
  const edgarFailed: string[] = [];

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      let filings: Form4Filing[];
      try {
        filings = await searchRecentForm4(ticker, 3, 8);
      } catch {
        edgarFailed.push(ticker);
        return;
      }
      const parsedResults = await Promise.allSettled(
        filings.map((f) =>
          parseForm4Purchases(f.accessionNo, f.cik, f.filedAt, f.periodOfReport, f.entityName, ticker)
        )
      );
      for (const r of parsedResults) {
        if (r.status === "fulfilled") {
          recentPurchases.push(...r.value);
        }
      }
    })
  );

  // Sort by total value descending
  recentPurchases.sort((a, b) => b.totalValue - a.totalValue);

  if (recentPurchases.length > 0) {
    const lines = recentPurchases.map((p, i) => {
      const val = p.totalValue >= 1e6
        ? `$${(p.totalValue / 1e6).toFixed(2)}M`
        : `$${Math.round(p.totalValue).toLocaleString()}`;
      const position = p.isNewPosition ? " [NEW POSITION]" : " [ADDITION]";
      const titlePart = p.title ? ` (${p.title})` : "";
      return `${i + 1}. ${p.insiderName}${titlePart} — BOUGHT ${p.shares.toLocaleString()} shares @ $${p.price.toFixed(2)} = ${val}${position}\n   Filed: ${p.filedAt} | Period: ${p.periodOfReport}`;
    });
    sections.push(`## RECENT FORM 4 FILINGS — Purchases >$100K (last 3 days)\n\n${lines.join("\n\n")}`);
  } else if (edgarFailed.length === tickers.length) {
    // Every lookup failed — we have NO information, not a "no activity" signal.
    sections.push(
      `## RECENT FORM 4 FILINGS (last 3 days)\n\n⚠️ EDGAR Form 4 lookup was UNAVAILABLE for ${tickers.join(", ")} (the SEC full-text search could not be reached). Recent insider purchase activity is UNKNOWN — do not treat this as an absence of purchases.`
    );
  } else {
    const failNote = edgarFailed.length
      ? ` (Note: the EDGAR lookup failed for ${edgarFailed.join(", ")}, so those are UNKNOWN rather than confirmed-empty.)`
      : "";
    sections.push(
      `## RECENT FORM 4 FILINGS (last 3 days)\n\nNo qualifying insider purchases (>$100K) found for ${tickers.join(", ")} in the last 3 days. This could mean no transactions occurred, or filings are delayed (Form 4 must be filed within 2 business days of transaction).${failNote}`
    );
  }

  // ── B. Finnhub 90-day history ──────────────────────────────────────────────
  const finnhubData: Record<string, object> = {};

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      try {
        const data = await getInsiderTransactions(ticker);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transactions = (data.data ?? []).slice(0, 20).map((t: any) => ({
          name: t.name,
          change: t.change,
          transactionPrice: t.transactionPrice,
          transactionDate: t.transactionDate,
          transactionCode: t.transactionCode, // P=purchase, S=sale
          share: t.share,
        }));

        const purchases = transactions.filter((t: { transactionCode: string }) => t.transactionCode === "P");
        const sales = transactions.filter((t: { transactionCode: string }) => t.transactionCode === "S");
        const totalBuyValue = purchases.reduce(
          (sum: number, t: { change: number; transactionPrice: number }) =>
            sum + Math.abs(t.change ?? 0) * (t.transactionPrice ?? 0),
          0
        );
        const totalSellValue = sales.reduce(
          (sum: number, t: { change: number; transactionPrice: number }) =>
            sum + Math.abs(t.change ?? 0) * (t.transactionPrice ?? 0),
          0
        );

        finnhubData[ticker] = {
          last90Days: {
            purchases: purchases.length,
            sales: sales.length,
            totalBuyValue: totalBuyValue >= 1e6 ? `$${(totalBuyValue / 1e6).toFixed(1)}M` : `$${Math.round(totalBuyValue).toLocaleString()}`,
            totalSellValue: totalSellValue >= 1e6 ? `$${(totalSellValue / 1e6).toFixed(1)}M` : `$${Math.round(totalSellValue).toLocaleString()}`,
            ratio: sales.length > 0 ? `${(purchases.length / sales.length).toFixed(1)}x buy/sell` : purchases.length > 0 ? "All purchases" : "No transactions",
          },
          notable: transactions.slice(0, 8),
        };
      } catch {
        finnhubData[ticker] = { error: "Could not fetch Finnhub insider data" };
      }
    })
  );

  sections.push(
    `## FINNHUB — 90-Day Insider Transaction History\n\n${JSON.stringify(finnhubData, null, 2)}`
  );

  const combinedData = sections.join("\n\n---\n\n");

  // ── C. LLM synthesis ──────────────────────────────────────────────────────
  return generate({
    agent: "insider",
    system: getSkillsPrompt("insider"),
    maxTokens: 1600,
    prompt: `You are an expert at reading SEC insider trading signals. Analyze the following insider trading data for ${tickers.join(", ")} and provide actionable insights.

${combinedData}

Write a structured analysis covering:
1. **Recent Activity (Form 4)**: Highlight any significant purchases in the last 3 days — who bought, how much, and whether it's a new or existing position. Large purchases from C-suite executives are the most bullish signal.
2. **90-Day Pattern**: Summarize the overall buy/sell ratio trend from Finnhub. Is management net buyers or net sellers?
3. **Signal Quality**: Are these open-market purchases (most bullish) or option exercises? Are executives buying at current market prices?
4. **Conviction Assessment**: Rate insider conviction as HIGH / MODERATE / LOW / NONE for each ticker with reasoning.
5. **Red Flags**: Any concerning patterns (heavy selling, CEO/CFO liquidating positions)?

Be direct and specific with dollar amounts and names.`,
  });
}
