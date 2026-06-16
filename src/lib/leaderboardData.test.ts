import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  getBasicFinancials: vi.fn(),
  getAlpacaSnapshots: vi.fn(),
  getAlpacaAvgVolumes: vi.fn(),
}));

vi.mock("@/lib/finnhub", () => ({ getBasicFinancials: deps.getBasicFinancials }));
vi.mock("@/lib/alpaca", () => ({
  getAlpacaSnapshots: deps.getAlpacaSnapshots,
  getAlpacaAvgVolumes: deps.getAlpacaAvgVolumes,
}));

import { getBoardData } from "./leaderboardData";

beforeEach(() => {
  vi.clearAllMocks();
  deps.getAlpacaSnapshots.mockResolvedValue(new Map([
    ["AAPL", { price: 200, changePct: 1.5, dayVolume: 20_000_000 }],
  ]));
  deps.getAlpacaAvgVolumes.mockResolvedValue(new Map([["AAPL", 10_000_000]]));
  deps.getBasicFinancials.mockImplementation(async (ticker: string) => {
    if (ticker === "AAPL") {
      return { metric: { marketCapitalization: 3_000_000, peTTM: 30, "10DayAverageTradingVolume": 55 } };
    }
    return { metric: { peBasicExclExtraTTM: 20, "3MonthAverageTradingVolume": 5 } };
  });
});

describe("getBoardData", () => {
  it("dedupes tickers and combines Alpaca snapshots, RVOL, and Finnhub metrics", async () => {
    await expect(getBoardData(["aapl", "AAPL", "msft"])).resolves.toEqual([
      {
        ticker: "AAPL",
        price: 200,
        changePct: 1.5,
        marketCap: 3_000_000_000_000,
        pe: 30,
        avgVol: 55_000_000,
        rvol: 2,
      },
      {
        ticker: "MSFT",
        price: null,
        changePct: null,
        marketCap: null,
        pe: 20,
        avgVol: 5_000_000,
        rvol: null,
      },
    ]);
    expect(deps.getAlpacaSnapshots).toHaveBeenCalledWith(["AAPL", "MSFT"]);
    expect(deps.getAlpacaAvgVolumes).toHaveBeenCalledWith(["AAPL", "MSFT"]);
  });

  it("failure-isolates market data providers and per-ticker metrics", async () => {
    deps.getAlpacaSnapshots.mockRejectedValueOnce(new Error("alpaca down"));
    deps.getAlpacaAvgVolumes.mockRejectedValueOnce(new Error("vol down"));
    deps.getBasicFinancials.mockRejectedValueOnce(new Error("metrics down"));

    await expect(getBoardData(["AAPL"])).resolves.toEqual([
      {
        ticker: "AAPL",
        price: null,
        changePct: null,
        marketCap: null,
        pe: null,
        avgVol: null,
        rvol: null,
      },
    ]);
  });
});
