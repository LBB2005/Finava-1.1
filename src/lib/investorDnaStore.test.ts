import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FactorScores, Stock } from "@/lib/research";

const deps = vi.hoisted(() => ({
  holdingsGet: vi.fn(),
  convGet: vi.fn(),
  dnaGet: vi.fn(),
  dnaSet: vi.fn(),
  universe: vi.fn(),
}));

vi.mock("@/lib/factorUniverse", () => ({ getFactorUniverse: deps.universe }));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return {
        doc: vi.fn(() => ({
          collection: vi.fn((sub: string) => {
            if (sub === "holdings") return { get: deps.holdingsGet };
            if (sub === "convictions") return { select: vi.fn(() => ({ get: deps.convGet })) };
            if (sub === "investorDNA") return { doc: vi.fn(() => ({ get: deps.dnaGet, set: deps.dnaSet })) };
            throw new Error(`unexpected subcollection ${sub}`);
          }),
        })),
      };
    }),
  },
}));

import { deriveAndCacheDna, readCachedDna } from "./investorDnaStore";

function stock(ticker: string, price: number, f: Partial<FactorScores> = {}): Stock {
  return {
    ticker, name: ticker, sector: "Technology", price, chg: 0,
    f: { mom: 60, growth: 60, quality: 60, analyst: 60, value: 60, health: 60, ...f },
    mv: { week: 0, month: 0, year: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.dnaSet.mockResolvedValue(undefined);
});

describe("deriveAndCacheDna", () => {
  it("derives from holdings + universe and writes the cache snapshot", async () => {
    deps.holdingsGet.mockResolvedValue({ empty: false, docs: [{ data: () => ({ ticker: "AAA", shares: 2, avgCost: 50 }) }] });
    deps.convGet.mockResolvedValue({ size: 3 });
    deps.universe.mockResolvedValue({ stocks: [stock("AAA", 100, { mom: 90 })] });

    const dna = await deriveAndCacheDna("user_123");

    expect(dna).not.toBeNull();
    expect(dna!.holdingsCount).toBe(1);
    expect(deps.dnaSet).toHaveBeenCalledTimes(1);
    expect(deps.dnaSet.mock.calls[0][0]).toMatchObject({ archetype: expect.any(String) });
  });

  it("returns null and skips the cache write when nothing joins the universe", async () => {
    deps.holdingsGet.mockResolvedValue({ empty: false, docs: [{ data: () => ({ ticker: "ZZZ", shares: 2, avgCost: 50 }) }] });
    deps.convGet.mockResolvedValue({ size: 0 });
    deps.universe.mockResolvedValue({ stocks: [stock("AAA", 100)] });

    const dna = await deriveAndCacheDna("user_123");

    expect(dna).toBeNull();
    expect(deps.dnaSet).not.toHaveBeenCalled();
  });

  it("short-circuits with no holdings — skips the costly universe compute", async () => {
    deps.holdingsGet.mockResolvedValue({ empty: true, docs: [] });

    const dna = await deriveAndCacheDna("user_123");

    expect(dna).toBeNull();
    expect(deps.universe).not.toHaveBeenCalled();
    expect(deps.dnaSet).not.toHaveBeenCalled();
  });
});

describe("readCachedDna", () => {
  it("returns the cached snapshot when present", async () => {
    deps.dnaGet.mockResolvedValue({ exists: true, data: () => ({ archetype: "Quality compounder" }) });
    expect(await readCachedDna("user_123")).toMatchObject({ archetype: "Quality compounder" });
  });

  it("returns null when no snapshot exists", async () => {
    deps.dnaGet.mockResolvedValue({ exists: false });
    expect(await readCachedDna("user_123")).toBeNull();
  });

  it("returns null if the read throws", async () => {
    deps.dnaGet.mockRejectedValue(new Error("firestore down"));
    expect(await readCachedDna("user_123")).toBeNull();
  });
});
