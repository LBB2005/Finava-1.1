import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FactorScores, Stock } from "@/lib/research";

const deps = vi.hoisted(() => ({
  settingsGet: vi.fn(),
  convGet: vi.fn(),
  readCached: vi.fn(),
  derive: vi.fn(),
  universe: vi.fn(),
}));

vi.mock("@/lib/withRoute", () => ({
  withRoute: vi.fn(
    (_opts: unknown, handler: (ctx: { req: Request; userId: string; body: unknown }) => unknown) =>
      async (req: Request) => handler({ req, userId: "user_123", body: undefined })
  ),
}));

vi.mock("@/lib/factorUniverse", () => ({ getFactorUniverse: deps.universe }));
vi.mock("@/lib/investorDnaStore", () => ({ readCachedDna: deps.readCached, deriveAndCacheDna: deps.derive }));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "userSettings") return { doc: vi.fn(() => ({ get: deps.settingsGet })) };
      if (name === "users") {
        return {
          doc: vi.fn(() => ({
            collection: vi.fn(() => ({
              where: vi.fn(() => ({ limit: vi.fn(() => ({ get: deps.convGet })) })),
            })),
          })),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    }),
  },
}));

import { GET } from "./route";

function stock(ticker: string, f: Partial<FactorScores>): Stock {
  return {
    ticker, name: ticker, sector: "Technology", price: 100, chg: 0,
    f: { mom: 50, growth: 50, quality: 50, analyst: 50, value: 50, health: 50, ...f },
    mv: { week: 0, month: 0, year: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.settingsGet.mockResolvedValue({ data: () => ({ allowInvestorDNA: true }) });
  deps.convGet.mockResolvedValue({ empty: true, docs: [] });
  deps.universe.mockResolvedValue({ stocks: [stock("NVDA", { mom: 90 })] });
  deps.readCached.mockResolvedValue({
    dnaVector: { mom: 80, growth: 50, quality: 50, analyst: 50, value: 50, health: 50 },
    traitRecord: [],
  });
});

describe("GET /api/dna/lens", () => {
  it("returns {line:null} without a ticker", async () => {
    const res = await GET(new Request("http://t.local/api/dna/lens"));
    await expect(res.json()).resolves.toEqual({ line: null });
  });

  it("returns {line:null} when DNA is disabled", async () => {
    deps.settingsGet.mockResolvedValue({ data: () => ({ allowInvestorDNA: false }) });
    const res = await GET(new Request("http://t.local/api/dna/lens?ticker=NVDA"));
    await expect(res.json()).resolves.toEqual({ line: null });
  });

  it("surfaces a conviction thesis when present", async () => {
    deps.convGet.mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ thesisTrait: "post-hype reset", status: "playing_out", outcomePct: 11 }) }],
    });
    const res = await GET(new Request("http://t.local/api/dna/lens?ticker=NVDA"));
    const body = await res.json();
    expect(body.line).toContain("Your thesis: post-hype reset");
    expect(body.tone).toBe("edge");
  });

  it("falls back to a factor-based whisper from the DNA tilt", async () => {
    const res = await GET(new Request("http://t.local/api/dna/lens?ticker=NVDA"));
    const body = await res.json();
    expect(body.line).toContain("tilt toward momentum");
  });
});
