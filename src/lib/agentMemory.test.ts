import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  cacheDocs: new Map<string, Record<string, unknown>>(),
  memoryDocs: [] as Array<Record<string, unknown>>,
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDelete: vi.fn(),
  batchSet: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
  autoId: 0,
}));

// firebase-admin: only firestore.Timestamp is used by agentMemory (for the TTL
// field written to agentCache). Provide a minimal Timestamp stand-in.
vi.mock("firebase-admin", () => {
  class Timestamp {
    constructor(public _ms: number) {}
    static fromDate(d: Date) {
      return new Timestamp(d.getTime());
    }
    toDate() {
      return new Date(this._ms);
    }
  }
  return { firestore: { Timestamp } };
});

// In-memory tickerMemory query builder supporting where(==/in) + orderBy + limit
// + get + count, plus collection.doc() for batched writes.
function makeTickerQuery(filter: { in?: string[]; eq?: string }) {
  const matching = () =>
    deps.memoryDocs
      .map((data, idx) => ({ data, idx }))
      .filter(({ data }) => {
        const t = data.ticker as string;
        if (filter.eq != null) return t === filter.eq;
        if (filter.in != null) return filter.in.includes(t);
        return true;
      });

  const snapshot = (dir: "asc" | "desc", limitN?: number) => {
    const sorted = matching().sort((a, b) => {
      const av = String(a.data.createdAt);
      const bv = String(b.data.createdAt);
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    const sliced = limitN == null ? sorted : sorted.slice(0, limitN);
    return {
      size: sliced.length,
      docs: sliced.map(({ data, idx }) => ({
        id: `mem_${idx}`,
        data: () => data,
        ref: { id: `mem_${idx}` },
      })),
    };
  };

  return {
    where: (_field: string, op: string, val: string | string[]) =>
      op === "in"
        ? makeTickerQuery({ ...filter, in: val as string[] })
        : makeTickerQuery({ ...filter, eq: val as string }),
    orderBy: (_field: string, dir: "asc" | "desc") => ({
      limit: (n: number) => ({ get: vi.fn(async () => snapshot(dir, n)) }),
      get: vi.fn(async () => snapshot(dir)),
    }),
    count: () => ({
      get: vi.fn(async () => ({ data: () => ({ count: matching().length }) })),
    }),
    doc: vi.fn(() => ({ id: `mem_new_${deps.autoId++}` })),
  };
}

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    batch: vi.fn(() => ({
      set: deps.batchSet,
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
        return makeTickerQuery({});
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
  deps.autoId = 0;
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

  it("uses agent-specific TTLs and default TTLs, storing expiresAt as a Timestamp", async () => {
    await saveCache("run_dcf_agent", { ticker: "AAPL" }, "dcf");
    await saveCache("custom_agent", { ticker: "AAPL" }, "custom");

    const rows = [...deps.cacheDocs.values()];
    const iso = (v: unknown) => (v as { toDate: () => Date }).toDate().toISOString();

    expect(rows[0]).toMatchObject({ agentName: "run_dcf_agent", result: "dcf" });
    // 48h TTL for the DCF agent.
    expect(iso(rows[0].expiresAt)).toBe("2026-06-17T12:00:00.000Z");
    expect(iso(rows[0].createdAt)).toBe("2026-06-15T12:00:00.000Z");

    expect(rows[1]).toMatchObject({ agentName: "custom_agent", result: "custom" });
    // 6h default TTL for unknown agents.
    expect(iso(rows[1].expiresAt)).toBe("2026-06-15T18:00:00.000Z");
  });

  it("treats expired cache entries as a miss without deleting, and swallows Firestore errors", async () => {
    await saveCache("run_news_agent", { ticker: "AAPL" }, "old");
    const savedKey = [...deps.cacheDocs.keys()][0];
    deps.cacheDocs.set(savedKey, { result: "old", expiresAt: "2026-06-15T11:59:59.000Z" });

    await expect(checkCache("run_news_agent", { ticker: "AAPL" })).resolves.toBeNull();
    // Native TTL reclaims expired rows — no application-side delete write.
    expect(deps.cacheDelete).not.toHaveBeenCalled();

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

  it("saves parsed insights in one batch and prunes the oldest beyond the cap", async () => {
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

    // Adds go through a single batched write, not per-line add() calls.
    expect(deps.batchSet).toHaveBeenCalledWith(expect.anything(), {
      ticker: "AAPL",
      insight: "DCF fair value is still below spot.",
      source: null,
      createdAt: "2026-06-15T12:00:00.000Z",
    });
    expect(deps.batchSet).toHaveBeenCalledWith(expect.anything(), {
      ticker: "MSFT",
      insight: "Azure growth supports margins.",
      source: null,
      createdAt: "2026-06-15T12:00:00.000Z",
    });
    // AAPL had 15 rows; adding 1 forces exactly one prune-delete. One commit total.
    expect(deps.batchDelete).toHaveBeenCalledTimes(1);
    expect(deps.batchCommit).toHaveBeenCalledTimes(1);
  });

  it("skips memory saves when there is no ticker or response body", async () => {
    const anthropicClient = { messages: { create: vi.fn() } };

    await saveTickerMemory([], "analysis", anthropicClient as never);
    await saveTickerMemory(["AAPL"], "", anthropicClient as never);

    expect(anthropicClient.messages.create).not.toHaveBeenCalled();
  });
});
