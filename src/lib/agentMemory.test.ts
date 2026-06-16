import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  cacheDocs: new Map<string, Record<string, unknown>>(),
  memoryDocs: [] as Array<Record<string, unknown>>,
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDelete: vi.fn(),
  memoryAdd: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    batch: vi.fn(() => ({
      delete: deps.batchDelete,
      commit: deps.batchCommit,
    })),
    collection: vi.fn((name: string) => {
      if (name === "agentCache") {
        return {
          doc: vi.fn((key: string) => ({
            get: deps.cacheGet.mockImplementation(async () => {
              const row = deps.cacheDocs.get(key);
              return { exists: !!row, data: () => row };
            }),
            set: deps.cacheSet.mockImplementation(async (row) => {
              deps.cacheDocs.set(key, row);
            }),
            delete: deps.cacheDelete.mockResolvedValue(undefined),
          })),
        };
      }
      if (name === "tickerMemory") {
        const query = {
          where: vi.fn((_field: string, _op: string, ticker: string) => ({
            orderBy: vi.fn((_field2: string, direction: "asc" | "desc") => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  docs: deps.memoryDocs
                    .filter((d) => d.ticker === ticker)
                    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                    .map((d, i) => ({ id: `${ticker}_${i}`, data: () => d, ref: { id: `${ticker}_${i}` } })),
                })),
              })),
              get: vi.fn(async () => ({
                size: deps.memoryDocs.filter((d) => d.ticker === ticker).length,
                docs: deps.memoryDocs
                  .filter((d) => d.ticker === ticker)
                  .sort((a, b) =>
                    direction === "asc"
                      ? String(a.createdAt).localeCompare(String(b.createdAt))
                      : String(b.createdAt).localeCompare(String(a.createdAt))
                  )
                  .map((d, i) => ({ id: `${ticker}_${i}`, data: () => d, ref: { id: `${ticker}_${i}` } })),
              })),
            })),
          })),
          add: deps.memoryAdd.mockImplementation(async (row) => {
            deps.memoryDocs.push(row);
          }),
        };
        return query;
      }
      throw new Error(`unexpected collection ${name}`);
    }),
  },
}));

import {
  checkCache,
  extractTickers,
  getTickerMemory,
  saveCache,
  saveTickerMemory,
} from "./agentMemory";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  vi.clearAllMocks();
  deps.cacheDocs = new Map();
  deps.memoryDocs = [];
  deps.batchCommit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("agent result cache", () => {
  it("builds stable cache keys independent of object key and array order", async () => {
    await saveCache("run_dcf_agent", { tickers: ["MSFT", "AAPL"], nested: { b: 2, a: 1 } }, "first");
    const savedKey = [...deps.cacheDocs.keys()][0];
    deps.cacheDocs.set(savedKey, {
      result: "cached",
      expiresAt: "2026-06-15T13:00:00.000Z",
    });

    await expect(
      checkCache("run_dcf_agent", { nested: { a: 1, b: 2 }, tickers: ["AAPL", "MSFT"] })
    ).resolves.toBe("cached");
  });

  it("uses agent-specific TTLs and default TTLs when saving cache rows", async () => {
    await saveCache("run_dcf_agent", { ticker: "AAPL" }, "dcf");
    await saveCache("custom_agent", { ticker: "AAPL" }, "custom");

    const rows = [...deps.cacheDocs.values()];
    expect(rows[0]).toMatchObject({
      agentName: "run_dcf_agent",
      result: "dcf",
      expiresAt: "2026-06-17T12:00:00.000Z",
      createdAt: "2026-06-15T12:00:00.000Z",
    });
    expect(rows[1]).toMatchObject({
      agentName: "custom_agent",
      result: "custom",
      expiresAt: "2026-06-15T18:00:00.000Z",
    });
  });

  it("lazily deletes expired cache entries and swallows Firestore errors", async () => {
    await saveCache("run_news_agent", { ticker: "AAPL" }, "old");
    const savedKey = [...deps.cacheDocs.keys()][0];
    deps.cacheDocs.set(savedKey, { result: "old", expiresAt: "2026-06-15T11:59:59.000Z" });

    await expect(checkCache("run_news_agent", { ticker: "AAPL" })).resolves.toBeNull();
    expect(deps.cacheDelete).toHaveBeenCalled();

    deps.cacheGet.mockRejectedValueOnce(new Error("firestore down"));
    await expect(checkCache("run_news_agent", { ticker: "AAPL" })).resolves.toBeNull();
  });
});

describe("ticker memory", () => {
  it("extracts likely tickers while filtering finance and common-word blocklist terms", () => {
    expect(
      extractTickers("Compare $AAPL and MSFT versus ETF exposure, CPI, DCF, and CEO commentary.")
    ).toEqual(["AAPL", "MSFT"]);
  });

  it("formats recent ticker insights for CEO prompt injection", async () => {
    deps.memoryDocs = [
      {
        ticker: "AAPL",
        insight: "AAPL trades above the last DCF range.",
        source: "ceo",
        createdAt: "2026-06-10T00:00:00.000Z",
      },
      {
        ticker: "MSFT",
        insight: "MSFT margins remain resilient.",
        createdAt: { toDate: () => new Date("2026-06-12T00:00:00.000Z") },
      },
    ];

    await expect(getTickerMemory(["aapl", "MSFT"])).resolves.toContain(
      "[AAPL · 2026-06-10 · ceo] AAPL trades above the last DCF range."
    );
    await expect(getTickerMemory(["aapl", "MSFT"])).resolves.toContain(
      "[MSFT · 2026-06-12] MSFT margins remain resilient."
    );
    await expect(getTickerMemory([])).resolves.toBe("");
  });

  it("saves parsed ticker insights and prunes beyond the per-ticker cap", async () => {
    deps.memoryDocs = Array.from({ length: 15 }, (_, i) => ({
      ticker: "AAPL",
      insight: `old ${i}`,
      createdAt: `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const anthropicClient = {
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: "text",
              text: "AAPL: DCF fair value is still below spot.\nMSFT: Azure growth supports margins.\nTSLA: ignored",
            },
          ],
        })),
      },
    };

    await saveTickerMemory(["AAPL", "MSFT"], "analysis text", anthropicClient as never);

    expect(deps.memoryAdd).toHaveBeenCalledWith({
      ticker: "AAPL",
      insight: "DCF fair value is still below spot.",
      source: null,
      createdAt: "2026-06-15T12:00:00.000Z",
    });
    expect(deps.memoryAdd).toHaveBeenCalledWith({
      ticker: "MSFT",
      insight: "Azure growth supports margins.",
      source: null,
      createdAt: "2026-06-15T12:00:00.000Z",
    });
    expect(deps.batchDelete).toHaveBeenCalled();
    expect(deps.batchCommit).toHaveBeenCalled();
  });

  it("skips memory saves when there is no ticker or response body", async () => {
    const anthropicClient = { messages: { create: vi.fn() } };

    await saveTickerMemory([], "analysis", anthropicClient as never);
    await saveTickerMemory(["AAPL"], "", anthropicClient as never);

    expect(anthropicClient.messages.create).not.toHaveBeenCalled();
  });
});
