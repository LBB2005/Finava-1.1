import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { MoneyMapEvent, MoneyRelation } from "@/lib/moneyMap";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userRateLimit: vi.fn(),
  checkUsageLimit: vi.fn(),
  enterWith: vi.fn(),
  getCompanyProfile: vi.fn(),
  getPeers: vi.fn(),
  getOwnership: vi.fn(),
  getFundOwnership: vi.fn(),
  runSupplyChainAgent: vi.fn(),
  relationsFromPeers: vi.fn(),
  relationsFromOwnership: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/rateLimit", () => ({ userRateLimit: deps.userRateLimit }));
vi.mock("@/lib/usage", () => ({
  checkUsageLimit: deps.checkUsageLimit,
  recordUsage: vi.fn(),
  makeRunContext: (userId: string) => ({ userId }),
  usageStore: { enterWith: deps.enterWith, run: (_c: unknown, fn: () => unknown) => fn() },
}));
vi.mock("@/lib/finnhub", () => ({
  getCompanyProfile: deps.getCompanyProfile,
  getPeers: deps.getPeers,
  getOwnership: deps.getOwnership,
  getFundOwnership: deps.getFundOwnership,
}));
vi.mock("@/agents/sub-agents/supply-chain-agent", () => ({
  runSupplyChainAgent: deps.runSupplyChainAgent,
}));
vi.mock("@/lib/moneyMap", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  relationsFromPeers: deps.relationsFromPeers,
  relationsFromOwnership: deps.relationsFromOwnership,
}));

import { POST } from "./route";

const ctx = (ticker: string) => ({ params: Promise.resolve({ ticker }) });
const req = () => new Request("http://test.local/api/stock/AAPL/money-map", { method: "POST" });

function relation(over: Partial<MoneyRelation> = {}): MoneyRelation {
  return {
    id: "peer:MSFT",
    kind: "peer",
    name: "Microsoft",
    ticker: "MSFT",
    weightPct: null,
    intensity: 0.5,
    direction: "none",
    confidence: "verified",
    source: "finnhub",
    ...over,
  };
}

/** Drain the SSE body into the decoded event objects, in emission order. */
async function drain(res: Response): Promise<MoneyMapEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")) as MoneyMapEvent);
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
  deps.userRateLimit.mockResolvedValue(null);
  deps.checkUsageLimit.mockResolvedValue(null);
  deps.getCompanyProfile.mockResolvedValue({
    name: "Apple Inc.",
    finnhubIndustry: "Technology",
    marketCapitalization: 3_000_000, // Finnhub reports millions
  });
  deps.getPeers.mockResolvedValue(["MSFT"]);
  deps.getOwnership.mockResolvedValue({ ownership: [] });
  deps.getFundOwnership.mockResolvedValue({ ownership: [] });
  deps.relationsFromPeers.mockReturnValue([relation()]);
  deps.relationsFromOwnership.mockReturnValue([]);
  deps.runSupplyChainAgent.mockResolvedValue([]);
});

describe("POST /api/stock/[ticker]/money-map — response shape", () => {
  it("streams as SSE with buffering disabled", async () => {
    const res = await POST(req(), ctx("AAPL"));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("emits self first and done last", async () => {
    const events = await drain(await POST(req(), ctx("AAPL")));
    expect(events[0].type).toBe("self");
    expect(events.at(-1)!.type).toBe("done");
    expect(typeof (events.at(-1) as { generatedAt: string }).generatedAt).toBe("string");
  });
});

describe("POST /api/stock/[ticker]/money-map — the self node", () => {
  it("carries the profile name, sector and market cap in absolute dollars", async () => {
    const [self] = await drain(await POST(req(), ctx("AAPL")));
    expect(self).toEqual({
      type: "self",
      self: { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", marketCap: 3e12 },
    });
  });

  it("uppercases and trims the ticker", async () => {
    const [self] = await drain(await POST(req(), ctx("  aapl  ")));
    expect((self as { self: { ticker: string } }).self.ticker).toBe("AAPL");
  });

  it("falls back to the bare symbol when the profile lookup fails", async () => {
    deps.getCompanyProfile.mockRejectedValueOnce(new Error("finnhub 429"));
    const [self] = await drain(await POST(req(), ctx("AAPL")));
    expect((self as { self: unknown }).self).toEqual({
      ticker: "AAPL",
      name: "AAPL",
      sector: null,
      marketCap: null,
    });
  });

  it("nulls sector and market cap when the profile omits them", async () => {
    deps.getCompanyProfile.mockResolvedValueOnce({ name: "Apple Inc." });
    const [self] = await drain(await POST(req(), ctx("AAPL")));
    expect((self as { self: unknown }).self).toMatchObject({ sector: null, marketCap: null });
  });

  it("ignores a blank profile name", async () => {
    deps.getCompanyProfile.mockResolvedValueOnce({ name: "" });
    const [self] = await drain(await POST(req(), ctx("AAPL")));
    expect((self as { self: { name: string } }).self.name).toBe("AAPL");
  });

  it("400s a missing ticker before opening a stream", async () => {
    const res = await POST(req(), ctx("   "));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing ticker." });
    expect(deps.getPeers).not.toHaveBeenCalled();
  });
});

describe("POST /api/stock/[ticker]/money-map — relations", () => {
  it("emits verified peer and ownership legs", async () => {
    deps.relationsFromOwnership.mockImplementation((_raw: unknown, source: string) => [
      relation({ id: `owner:${source}`, kind: "owner", name: source, ticker: null }),
    ]);

    const events = await drain(await POST(req(), ctx("AAPL")));
    const relations = events.filter((e) => e.type === "relation") as {
      relation: MoneyRelation;
    }[];
    expect(relations.map((e) => e.relation.id)).toEqual([
      "peer:MSFT",
      "owner:Institutional",
      "owner:Fund",
    ]);
  });

  it("labels the two ownership sources distinctly", async () => {
    await drain(await POST(req(), ctx("AAPL")));
    expect(deps.relationsFromOwnership).toHaveBeenCalledWith({ ownership: [] }, "Institutional");
    expect(deps.relationsFromOwnership).toHaveBeenCalledWith({ ownership: [] }, "Fund");
  });

  it("excludes the subject from its own peer list", async () => {
    await drain(await POST(req(), ctx("AAPL")));
    expect(deps.relationsFromPeers).toHaveBeenCalledWith(["MSFT"], "AAPL");
  });

  it("emits the AI-estimated supply-chain leg after the verified ones", async () => {
    deps.runSupplyChainAgent.mockResolvedValueOnce([
      relation({ id: "supplier:TSM", kind: "supplier", name: "TSMC", confidence: "estimated" }),
    ]);
    const events = await drain(await POST(req(), ctx("AAPL")));
    const ids = events.filter((e) => e.type === "relation").map((e) => (e as { relation: MoneyRelation }).relation.id);
    expect(ids).toEqual(["peer:MSFT", "supplier:TSM"]);
    expect(deps.runSupplyChainAgent).toHaveBeenCalledWith("AAPL", "Apple Inc.");
  });

  it("keeps streaming when a verified leg rejects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.getPeers.mockRejectedValueOnce(new Error("finnhub 500"));

    const events = await drain(await POST(req(), ctx("AAPL")));
    expect(events.at(-1)!.type).toBe("done");
    expect(events.some((e) => e.type === "relation" && e.relation.id === "peer:MSFT")).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("still completes when the supply-chain agent throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.runSupplyChainAgent.mockRejectedValueOnce(new Error("edgar timeout"));

    const events = await drain(await POST(req(), ctx("AAPL")));
    expect(events.at(-1)!.type).toBe("done");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("emits only self and done when nothing resolves", async () => {
    deps.relationsFromPeers.mockReturnValue([]);
    const events = await drain(await POST(req(), ctx("AAPL")));
    expect(events.map((e) => e.type)).toEqual(["self", "done"]);
  });
});

describe("POST /api/stock/[ticker]/money-map — guards", () => {
  it("401s an unauthenticated request", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(req(), ctx("AAPL"))).status).toBe(401);
    expect(deps.getCompanyProfile).not.toHaveBeenCalled();
  });

  it("returns the throttle response before any upstream call", async () => {
    deps.userRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    expect((await POST(req(), ctx("AAPL"))).status).toBe(429);
    expect(deps.getCompanyProfile).not.toHaveBeenCalled();
  });

  it("returns the usage-limit response when out of credits", async () => {
    deps.checkUsageLimit.mockResolvedValueOnce(
      NextResponse.json({ error: "Limit reached" }, { status: 429 }),
    );
    expect((await POST(req(), ctx("AAPL"))).status).toBe(429);
    expect(deps.getCompanyProfile).not.toHaveBeenCalled();
  });

  it("meters the run against the caller", async () => {
    await drain(await POST(req(), ctx("AAPL")));
    expect(deps.enterWith).toHaveBeenCalledWith({ userId: "user_1" });
  });
});
