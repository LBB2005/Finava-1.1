import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  settingsGet: vi.fn(),
  holdingsGet: vi.fn(),
  dnaSet: vi.fn(),
  derive: vi.fn(),
}));

vi.mock("@/lib/withRoute", () => ({
  withRoute: vi.fn(
    (_opts: unknown, handler: (ctx: { req: Request; userId: string; body: unknown }) => unknown) =>
      async (req: Request) => {
        let body: unknown;
        try {
          body = req.method === "PATCH" ? await req.json() : undefined;
        } catch {
          body = undefined;
        }
        return handler({ req, userId: "user_123", body });
      }
  ),
}));

vi.mock("@/lib/investorDnaStore", () => ({ deriveAndCacheDna: deps.derive }));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "userSettings") return { doc: vi.fn(() => ({ get: deps.settingsGet })) };
      if (name === "users") {
        return {
          doc: vi.fn(() => ({
            collection: vi.fn((sub: string) => {
              if (sub === "holdings") return { select: vi.fn(() => ({ get: deps.holdingsGet })) };
              if (sub === "investorDNA") return { doc: vi.fn(() => ({ set: deps.dnaSet })) };
              throw new Error(`unexpected subcollection ${sub}`);
            }),
          })),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    }),
  },
}));

import { GET, PATCH } from "./route";

const dnaObj = { archetype: "Quality compounder", coverage: { analyzed: 2, total: 3, uncovered: ["BTC"] } };

beforeEach(() => {
  vi.clearAllMocks();
  deps.dnaSet.mockResolvedValue(undefined);
  deps.settingsGet.mockResolvedValue({ data: () => ({ allowInvestorDNA: true }) });
});

describe("GET /api/dna", () => {
  it("returns DNA + uncovered when allowed and derivable", async () => {
    deps.derive.mockResolvedValue(dnaObj);
    const res = await GET(new Request("http://t.local/api/dna"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ dna: dnaObj, hasHoldings: true, allowed: true, uncovered: ["BTC"] });
  });

  it("returns allowed:false and skips derive when the toggle is off", async () => {
    deps.settingsGet.mockResolvedValue({ data: () => ({ allowInvestorDNA: false }) });
    const res = await GET(new Request("http://t.local/api/dna"));
    await expect(res.json()).resolves.toEqual({ dna: null, hasHoldings: false, allowed: false });
    expect(deps.derive).not.toHaveBeenCalled();
  });

  it("reports uncovered holdings when nothing could be derived", async () => {
    deps.derive.mockResolvedValue(null);
    deps.holdingsGet.mockResolvedValue({ size: 2, docs: [{ id: "VWO" }, { id: "BND" }] });
    const res = await GET(new Request("http://t.local/api/dna"));
    await expect(res.json()).resolves.toEqual({ dna: null, hasHoldings: true, allowed: true, uncovered: ["VWO", "BND"] });
  });
});

describe("PATCH /api/dna", () => {
  it("records the user's verdict as a feedback label", async () => {
    const res = await PATCH(new Request("http://t.local/api/dna", { method: "PATCH", body: JSON.stringify({ verdict: "confirmed", note: "" }) }));
    expect(res.status).toBe(200);
    expect(deps.dnaSet).toHaveBeenCalledWith(
      expect.objectContaining({ feedback: expect.objectContaining({ verdict: "confirmed" }) }),
      { merge: true }
    );
  });
});
