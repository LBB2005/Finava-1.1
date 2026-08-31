import { describe, it, expect, beforeEach, vi } from "vitest";

type Doc = Record<string, unknown>;
const store = vi.hoisted(() => new Map<string, Doc[]>());

// A query mock that supports the exact operators ledgerRead uses. Deliberately
// narrow: a generic fake would let a query pass here that Firestore rejects.
vi.mock("@/lib/firebase-admin", () => {
  function makeQuery(col: string, filters: [string, string, unknown][] = [], order?: [string, string], lim?: number) {
    return {
      where: (f: string, op: string, v: unknown) => makeQuery(col, [...filters, [f, op, v]], order, lim),
      orderBy: (f: string, dir: string) => makeQuery(col, filters, [f, dir], lim),
      limit: (n: number) => makeQuery(col, filters, order, n),
      get: async () => {
        let rows = [...(store.get(col) ?? [])];
        for (const [f, op, v] of filters) {
          rows = rows.filter((r) => {
            const val = r[f];
            if (op === "==") return val === v;
            if (op === "<") return String(val) < String(v);
            if (op === "in") return (v as unknown[]).includes(val);
            return true;
          });
        }
        if (order) {
          const [f, dir] = order;
          rows.sort((a, b) => (String(a[f]) < String(b[f]) ? -1 : 1));
          if (dir === "desc") rows.reverse();
        }
        if (lim !== undefined) rows = rows.slice(0, lim);
        return { empty: rows.length === 0, size: rows.length, docs: rows.map((r) => ({ data: () => r })) };
      },
      doc: (id: string) => ({
        get: async () => {
          const row = (store.get(col) ?? []).find((r) => r.tradingDay === id);
          return { exists: Boolean(row), data: () => row };
        },
      }),
    };
  }
  return { db: { collection: (col: string) => makeQuery(col) } };
});

import {
  getPriorSnapshot,
  getSnapshot,
  getOpeningDecisions,
  getDecisionsForDay,
  countEntriesToday,
  getDecisionsByIds,
} from "./ledgerRead";

beforeEach(() => {
  store.clear();
  store.set("liveSnapshots", [
    { tradingDay: "2026-09-08", equity: 10_000 },
    { tradingDay: "2026-09-09", equity: 10_500 },
  ]);
  store.set("liveDecisions", [
    { decisionId: "d1", ticker: "NVDA", kind: "entry", tradingDay: "2026-09-08" },
    { decisionId: "d2", ticker: "NVDA", kind: "add", tradingDay: "2026-09-09" },
    { decisionId: "d3", ticker: "MSFT", kind: "reject", tradingDay: "2026-09-09" },
    { decisionId: "d4", ticker: "AMD", kind: "entry", tradingDay: "2026-09-09" },
  ]);
});

describe("getPriorSnapshot", () => {
  it("returns the most recent day strictly before the one asked for", async () => {
    expect(await getPriorSnapshot("2026-09-09")).toMatchObject({ tradingDay: "2026-09-08" });
  });

  it("excludes today's own snapshot on a replay", async () => {
    // Reading today back as 'yesterday' would reset the drawdown baseline to
    // today's equity and silently discharge a live freeze.
    const prior = await getPriorSnapshot("2026-09-08");
    expect(prior).toBeNull();
  });

  it("returns null when nothing precedes it", async () => {
    expect(await getPriorSnapshot("2026-01-01")).toBeNull();
  });
});

describe("getSnapshot", () => {
  it("reads one day by id", async () => {
    expect(await getSnapshot("2026-09-08")).toMatchObject({ equity: 10_000 });
  });

  it("returns null for a day that was never run", async () => {
    expect(await getSnapshot("2026-09-07")).toBeNull();
  });
});

describe("getOpeningDecisions", () => {
  it("returns the most recent opener per ticker", async () => {
    const map = await getOpeningDecisions(["NVDA"]);
    expect(map.get("NVDA")).toEqual({ decisionId: "d2", tradingDay: "2026-09-09" });
  });

  it("omits a ticker whose only decision was a rejection", async () => {
    // A position the ledger cannot explain must read as unexplained, never as
    // explained by the nearest decision to hand.
    const map = await getOpeningDecisions(["MSFT"]);
    expect(map.has("MSFT")).toBe(false);
  });

  it("returns an empty map for no tickers, without querying", async () => {
    expect((await getOpeningDecisions([])).size).toBe(0);
  });

  it("chunks past Firestore's 30-value `in` limit", async () => {
    const many = Array.from({ length: 65 }, (_, i) => `T${i}`);
    await expect(getOpeningDecisions(many)).resolves.toBeInstanceOf(Map);
  });
});

describe("day queries", () => {
  it("returns every decision for a day, rejections included", async () => {
    const all = await getDecisionsForDay("2026-09-09");
    expect(all.map((d) => d.decisionId).sort()).toEqual(["d2", "d3", "d4"]);
  });

  it("counts only new entries for the max-per-day rail", async () => {
    // d2 is an add and d3 a reject — neither consumes an entry slot.
    expect(await countEntriesToday("2026-09-09")).toBe(1);
  });

  it("counts zero on a day with no decisions", async () => {
    expect(await countEntriesToday("2026-09-07")).toBe(0);
  });

  it("fetches decisions by id", async () => {
    const found = await getDecisionsByIds(["d1", "d3"]);
    expect(found.map((d) => d.decisionId).sort()).toEqual(["d1", "d3"]);
  });

  it("returns nothing for an empty id list", async () => {
    expect(await getDecisionsByIds([])).toEqual([]);
  });
});
