import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({
  generate: vi.fn(),
  AGENT_MODELS: { supplyChain: "anthropic/claude-sonnet-4.6" },
}));
vi.mock("@/lib/edgar", () => ({ getCikByTicker: vi.fn(), getLatest10KText: vi.fn() }));
vi.mock("@/lib/finnhub", () => ({ searchSymbol: vi.fn() }));
vi.mock("@/lib/agentMemory", () => ({ checkCache: vi.fn(), saveCache: vi.fn() }));

import { generate } from "@/lib/llm";
import { getCikByTicker, getLatest10KText } from "@/lib/edgar";
import { searchSymbol } from "@/lib/finnhub";
import { checkCache, saveCache } from "@/lib/agentMemory";
import { runSupplyChainAgent } from "./supply-chain-agent";

const mGen = vi.mocked(generate);
const mCik = vi.mocked(getCikByTicker);
const m10k = vi.mocked(getLatest10KText);
const mSearch = vi.mocked(searchSymbol);
const mCheck = vi.mocked(checkCache);
const mSave = vi.mocked(saveCache);

afterEach(() => vi.clearAllMocks());

describe("runSupplyChainAgent", () => {
  it("returns cached relations without calling the model", async () => {
    mCheck.mockResolvedValueOnce(
      JSON.stringify([
        { id: "customer:MSFT", kind: "customer", name: "Microsoft", ticker: "MSFT", intensity: 1 },
      ])
    );
    const out = await runSupplyChainAgent("NVDA", "Nvidia");
    expect(out).toHaveLength(1);
    expect(mGen).not.toHaveBeenCalled();
  });

  it("extracts from the 10-K, resolves a ticker, and caches the result", async () => {
    mCheck.mockResolvedValueOnce(null);
    mCik.mockResolvedValueOnce("0000320193");
    m10k.mockResolvedValueOnce("…major customers include Microsoft…");
    mGen.mockResolvedValueOnce(
      JSON.stringify({
        customers: [{ name: "Microsoft", ticker: null, weightPct: 20, note: "cloud GPUs" }],
        suppliers: [{ name: "TSMC", ticker: "TSM", weightPct: 40 }],
      })
    );
    // Microsoft has no ticker from the model → resolved via search
    mSearch.mockResolvedValueOnce({ result: [{ symbol: "MSFT" }] });

    const out = await runSupplyChainAgent("NVDA", "Nvidia");

    const msft = out.find((r) => r.name === "Microsoft")!;
    expect(msft.ticker).toBe("MSFT");
    expect(msft.id).toBe("customer:MSFT"); // id rebuilt after resolution
    expect(out.every((r) => r.confidence === "estimated")).toBe(true);
    expect(mSave).toHaveBeenCalledOnce();
  });

  it("falls back to general knowledge when no CIK / 10-K is available", async () => {
    mCheck.mockResolvedValueOnce(null);
    mCik.mockResolvedValueOnce(null); // no CIK → no 10-K fetch
    mGen.mockResolvedValueOnce(JSON.stringify({ customers: [], suppliers: [] }));

    const out = await runSupplyChainAgent("PRIV", "Private Co");
    expect(m10k).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    expect(mSave).not.toHaveBeenCalled(); // nothing extracted → nothing cached
  });

  it("returns [] when the model call throws", async () => {
    mCheck.mockResolvedValueOnce(null);
    mCik.mockResolvedValueOnce("0000320193");
    m10k.mockResolvedValueOnce("text");
    mGen.mockRejectedValueOnce(new Error("model down"));
    expect(await runSupplyChainAgent("NVDA", "Nvidia")).toEqual([]);
  });

  it("recomputes when the cache entry is corrupt JSON instead of crashing", async () => {
    mCheck.mockResolvedValueOnce("{not valid json"); // survives JSON.parse throw
    mCik.mockResolvedValueOnce(null);
    mGen.mockResolvedValueOnce(JSON.stringify({ customers: [], suppliers: [] }));
    const out = await runSupplyChainAgent("NVDA", "Nvidia");
    expect(out).toEqual([]);
    expect(mGen).toHaveBeenCalledOnce(); // fell through to a fresh compute
  });

  it("recomputes when the cache entry is valid JSON but not an array", async () => {
    mCheck.mockResolvedValueOnce(JSON.stringify({ unexpected: "shape" }));
    mCik.mockResolvedValueOnce(null);
    mGen.mockResolvedValueOnce(JSON.stringify({ customers: [], suppliers: [] }));
    await runSupplyChainAgent("NVDA", "Nvidia");
    expect(mGen).toHaveBeenCalledOnce();
  });

  it("does not attach foreign/compound symbols to an unresolved node", async () => {
    mCheck.mockResolvedValueOnce(null);
    mCik.mockResolvedValueOnce(null);
    mGen.mockResolvedValueOnce(
      JSON.stringify({ customers: [{ name: "Taiwan Semi", ticker: null }], suppliers: [] }),
    );
    // Finnhub returns a foreign listing — the "." must disqualify it.
    mSearch.mockResolvedValueOnce({ result: [{ symbol: "TSM.L" }] });
    const out = await runSupplyChainAgent("NVDA", "Nvidia");
    expect(out.find((r) => r.name === "Taiwan Semi")!.ticker).toBeFalsy(); // stayed non-clickable
  });

  it("leaves a node non-clickable when the symbol search errors", async () => {
    mCheck.mockResolvedValueOnce(null);
    mCik.mockResolvedValueOnce(null);
    mGen.mockResolvedValueOnce(
      JSON.stringify({ customers: [{ name: "Mystery Co", ticker: null }], suppliers: [] }),
    );
    mSearch.mockRejectedValueOnce(new Error("finnhub 429"));
    const out = await runSupplyChainAgent("NVDA", "Nvidia");
    expect(out.find((r) => r.name === "Mystery Co")!.ticker).toBeFalsy();
  });
});
