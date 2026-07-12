// Money Map · AI-estimated leg.
//
// No free feed names a company's suppliers and customers, so we extract them from
// the company's own latest 10-K (Item 1 "Business" carries the customer/supplier
// concentration disclosures), grounded and fenced so the filing text is treated
// as data, never instructions. Results are clearly badged "AI-estimated" in the
// UI and cached 14 days (the costliest call in the map).

import { AGENT_MODELS, generate } from "@/lib/llm";
import { getCikByTicker, getLatest10KText } from "@/lib/edgar";
import { searchSymbol } from "@/lib/finnhub";
import { checkCache, saveCache } from "@/lib/agentMemory";
import { fenceExternal, EXTERNAL_DATA_RULE } from "@/lib/externalContent";
import { DATA_ACCURACY_RULE_JSON } from "@/lib/dataAccuracy";
import { parseSupplyChainRelations, relationId, type MoneyRelation } from "@/lib/moneyMap";

const CACHE_AGENT = "run_supply_chain_agent";

/**
 * Extract estimated supplier + customer relations for a ticker. Returns [] (never
 * throws) so the Money Map stream degrades to its verified legs on any failure.
 */
export async function runSupplyChainAgent(
  ticker: string,
  companyName: string
): Promise<MoneyRelation[]> {
  const sym = ticker.toUpperCase();

  const cached = await checkCache(CACHE_AGENT, { ticker: sym });
  if (cached) {
    try {
      const relations = JSON.parse(cached) as MoneyRelation[];
      if (Array.isArray(relations)) return relations;
    } catch {
      /* corrupt cache entry — recompute below */
    }
  }

  const cik = await getCikByTicker(sym);
  const tenK = cik ? await getLatest10KText(cik) : null;

  const grounding = tenK
    ? `Use the company's latest 10-K excerpt below as your primary source. ${EXTERNAL_DATA_RULE}\n\n${fenceExternal("10-K excerpt", tenK)}`
    : `No 10-K text is available for ${companyName} (${sym}). Use your general knowledge; be conservative and only list relationships you are confident about.`;

  const prompt = `Identify the major CUSTOMERS (companies that buy from / drive revenue to ${companyName} (${sym})) and SUPPLIERS (key vendors/partners ${companyName} pays or depends on). These are real-world commercial relationships — NOT investors, shareholders, or subsidiaries.

${grounding}

Respond with ONLY this JSON (no markdown, no prose):
{
  "customers": [{"name": "<company>", "ticker": "<US stock ticker or null>", "weightPct": <0-100 share of revenue, or null>, "note": "<≤12 word reason>"}],
  "suppliers": [{"name": "<company>", "ticker": "<US stock ticker or null>", "weightPct": <0-100 estimated dependence, or null>, "note": "<≤12 word reason>"}]
}
Rules: at most 6 of each, most material first. Set weightPct only when the filing states or strongly implies a figure, otherwise null. Set ticker only for publicly listed companies you are confident about, otherwise null. If you genuinely don't know, return empty arrays.

${DATA_ACCURACY_RULE_JSON}`;

  let raw: string;
  try {
    raw = await generate({ agent: "supplyChain", maxTokens: 1500, prompt });
  } catch (err) {
    console.error("[supplyChain]", sym, err);
    return [];
  }

  const relations = parseSupplyChainRelations(raw, AGENT_MODELS["supplyChain"]);

  // Resolve any missing tickers so the nodes become clickable (best-effort).
  await Promise.allSettled(
    relations.map(async (r) => {
      if (r.ticker) return;
      try {
        const res = (await searchSymbol(r.name)) as { result?: Array<{ symbol?: unknown }> };
        const symbol = res?.result?.[0]?.symbol;
        // Plain US symbols only — skip foreign/compound results (e.g. "TSM.L").
        if (typeof symbol === "string" && /^[A-Z.\-]{1,6}$/.test(symbol) && !symbol.includes(".")) {
          r.ticker = symbol.toUpperCase();
          r.id = relationId(r.kind, r.ticker, r.name);
        }
      } catch {
        /* leave the node non-clickable */
      }
    })
  );

  if (relations.length) {
    await saveCache(CACHE_AGENT, { ticker: sym }, JSON.stringify(relations));
  }
  return relations;
}
