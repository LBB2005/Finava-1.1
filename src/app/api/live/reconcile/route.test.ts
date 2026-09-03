// Step 2 — join the broker's holdings to the ledger's reasons. The properties
// worth pinning: inception equity comes from the BROKER and is then carried
// forward, a funding/mandate mismatch is refused before day one, and a sector
// lookup failure degrades to null rather than mis-bucketing capital.
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  runStepFn: vi.fn(),
  alpacaTradingConfigured: vi.fn(),
  getAccount: vi.fn(),
  getPositions: vi.fn(),
  getPriorSnapshot: vi.fn(),
  getOpeningDecisions: vi.fn(),
  countEntriesToday: vi.fn(),
  getFactorUniverse: vi.fn(),
  evaluateDrawdown: vi.fn(),
  checkInceptionEquity: vi.fn(),
  appendSnapshot: vi.fn(),
  appendEvent: vi.fn(),
  LedgerConflictError: class LedgerConflictError extends Error {},
}));

vi.mock("@/lib/live/harness", () => ({
  // Pass-through. The real wrapper also maps a thrown step error to a 500; that
  // mapping is the harness's own contract, so here a refusal surfaces as a throw.
  withHarness: (h: (req: Request) => Promise<Response>) => h,
  easternDay: () => "2026-08-31",
  runStep: async (_runId: string, _step: string, fn: () => Promise<unknown>) => {
    const replayed = await deps.runStepFn();
    if (replayed) return { result: replayed, replayed: true };
    return { result: await fn(), replayed: false };
  },
}));
vi.mock("@/lib/alpacaTrading", () => ({
  alpacaTradingConfigured: deps.alpacaTradingConfigured,
  getAccount: deps.getAccount,
  getPositions: deps.getPositions,
}));
vi.mock("@/lib/live/mandate", () => ({
  evaluateDrawdown: deps.evaluateDrawdown,
  checkInceptionEquity: deps.checkInceptionEquity,
}));
vi.mock("@/lib/factorUniverse", () => ({ getFactorUniverse: deps.getFactorUniverse }));
vi.mock("@/lib/live/ledger", () => ({
  appendSnapshot: deps.appendSnapshot,
  appendEvent: deps.appendEvent,
  LedgerConflictError: deps.LedgerConflictError,
}));
vi.mock("@/lib/live/ledgerRead", () => ({
  getPriorSnapshot: deps.getPriorSnapshot,
  getOpeningDecisions: deps.getOpeningDecisions,
  countEntriesToday: deps.countEntriesToday,
}));
vi.mock("@/lib/live/version", () => ({
  AGENT_VERSION: "2026.08.31",
  executionMode: () => "paper",
}));

import { POST } from "./route";

const req = (body?: unknown) =>
  new Request("http://test.local/api/live/reconcile", {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

function position(over: Record<string, unknown> = {}) {
  return {
    symbol: "AAPL",
    side: "long",
    qty: 100,
    avgEntryPrice: 180,
    currentPrice: 190,
    marketValue: 19_000,
    costBasis: 18_000,
    unrealizedPlPct: 5.5,
    ...over,
  };
}

async function reconcile(body?: unknown) {
  const res = await POST(req(body));
  return { status: res.status, json: await res.json() };
}

/** The snapshot the step handed to the ledger. */
const appended = () => deps.appendSnapshot.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  deps.runStepFn.mockResolvedValue(null);
  deps.alpacaTradingConfigured.mockReturnValue(true);
  deps.getAccount.mockResolvedValue({
    equity: 100_000,
    cash: 30_000,
    accountBlocked: false,
    tradingBlocked: false,
  });
  deps.getPositions.mockResolvedValue([position()]);
  deps.getPriorSnapshot.mockResolvedValue(null);
  deps.getOpeningDecisions.mockResolvedValue(new Map());
  deps.countEntriesToday.mockResolvedValue(0);
  deps.getFactorUniverse.mockResolvedValue({
    stocks: [{ ticker: "AAPL", sector: "Technology" }],
  });
  deps.evaluateDrawdown.mockReturnValue({
    highWaterMark: 100_000,
    drawdownPct: 0,
    frozen: false,
    freezeDaysRemaining: 0,
    tripped: false,
  });
  deps.checkInceptionEquity.mockReturnValue({ matches: true, actual: 100_000, declared: 100_000, driftPct: 0 });
  deps.appendSnapshot.mockResolvedValue(undefined);
  deps.appendEvent.mockResolvedValue(undefined);
});

describe("POST /api/live/reconcile — configuration and ids", () => {
  it("503s when Alpaca is not configured", async () => {
    deps.alpacaTradingConfigured.mockReturnValueOnce(false);
    const { status, json } = await reconcile();
    expect(status).toBe(503);
    expect(json.error).toMatchObject({ code: "not_configured" });
    expect(deps.getAccount).not.toHaveBeenCalled();
  });

  it("defaults the runId to the ET trading day", async () => {
    const { json } = await reconcile();
    expect(json).toMatchObject({ runId: "2026-08-31", tradingDay: "2026-08-31" });
  });

  it("honours an explicit runId", async () => {
    expect((await reconcile({ runId: "manual-1" })).json.runId).toBe("manual-1");
  });

  it("tolerates an absent body", async () => {
    expect((await reconcile()).status).toBe(200);
  });

  it("returns the stored result on a replay without touching the broker", async () => {
    deps.runStepFn.mockResolvedValueOnce({ runId: "2026-08-31", snapshot: {} });
    const { json } = await reconcile();
    expect(json.replayed).toBe(true);
    expect(deps.getAccount).not.toHaveBeenCalled();
  });
});

describe("POST /api/live/reconcile — inception equity", () => {
  it("takes inception equity from the broker on the first run", async () => {
    await reconcile();
    expect(appended().inceptionEquity).toBe(100_000);
    expect(deps.checkInceptionEquity).toHaveBeenCalled();
  });

  it("carries a prior inception equity forward untouched, and re-checks nothing", async () => {
    deps.getPriorSnapshot.mockResolvedValueOnce({ inceptionEquity: 90_000, highWaterMark: 105_000 });
    await reconcile();
    expect(appended().inceptionEquity).toBe(90_000);
    expect(deps.checkInceptionEquity).not.toHaveBeenCalled();
  });

  it("computes cumulative return against inception, not the mandate", async () => {
    deps.getPriorSnapshot.mockResolvedValueOnce({ inceptionEquity: 80_000, highWaterMark: 100_000 });
    await reconcile();
    expect(appended().cumulativeReturnPct).toBeCloseTo(25, 6);
  });

  it("refuses a book whose funding does not match its frozen mandate", async () => {
    deps.checkInceptionEquity.mockReturnValueOnce({
      matches: false,
      actual: 50_000,
      declared: 100_000,
      driftPct: 50,
    });
    await expect(POST(req())).rejects.toThrow(/Inception equity mismatch/);
    expect(deps.appendSnapshot).not.toHaveBeenCalled();
  });
});

describe("POST /api/live/reconcile — positions", () => {
  it("weights each position against equity and joins the opening decision", async () => {
    deps.getOpeningDecisions.mockResolvedValueOnce(
      new Map([["AAPL", { decisionId: "2026-08-24-AAPL-entry", tradingDay: "2026-08-24" }]]),
    );
    await reconcile();
    expect(appended().positions[0]).toMatchObject({
      ticker: "AAPL",
      weightPct: 19,
      sector: "Technology",
      openedByDecisionId: "2026-08-24-AAPL-entry",
      openedOn: "2026-08-24",
      dataGap: false,
    });
  });

  it("treats the live weight as the target when no target was ever recorded", async () => {
    await reconcile();
    expect(appended().positions[0].targetWeightPct).toBe(19);
  });

  it("carries a recorded target weight forward", async () => {
    deps.getPriorSnapshot.mockResolvedValueOnce({
      inceptionEquity: 100_000,
      highWaterMark: 100_000,
      positions: [{ ticker: "AAPL", targetWeightPct: 5 }],
    });
    await reconcile();
    expect(appended().positions[0].targetWeightPct).toBe(5);
  });

  it("nulls the opening decision for a position the ledger does not explain", async () => {
    await reconcile();
    expect(appended().positions[0]).toMatchObject({
      openedByDecisionId: null,
      openedOn: null,
    });
  });

  it("nulls the sector when the universe lookup fails, rather than mis-bucketing", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.getFactorUniverse.mockRejectedValueOnce(new Error("polygon down"));
    const { status } = await reconcile();
    expect(status).toBe(200);
    expect(appended().positions[0].sector).toBeNull();
    spy.mockRestore();
  });

  it("nulls the sector for a name outside the scored universe", async () => {
    deps.getFactorUniverse.mockResolvedValueOnce({ stocks: [{ ticker: "MSFT", sector: "Technology" }] });
    await reconcile();
    expect(appended().positions[0].sector).toBeNull();
  });

  it("sums gross and short exposure", async () => {
    deps.getPositions.mockResolvedValueOnce([
      position(),
      position({ symbol: "TSLA", side: "short", marketValue: -5_000 }),
    ]);
    await reconcile();
    expect(appended().grossExposurePct).toBeCloseTo(24, 6);
    expect(appended().shortExposurePct).toBeCloseTo(5, 6);
  });

  it("guards a zero-equity account against divide-by-zero weights", async () => {
    deps.getAccount.mockResolvedValueOnce({
      equity: 0,
      cash: 0,
      accountBlocked: false,
      tradingBlocked: false,
    });
    deps.checkInceptionEquity.mockReturnValueOnce({ matches: true, actual: 0, declared: 0, driftPct: 0 });
    await reconcile();
    expect(appended().positions[0].weightPct).toBe(0);
    expect(appended().cashPct).toBe(0);
  });

  it("handles an empty book", async () => {
    deps.getPositions.mockResolvedValueOnce([]);
    await reconcile();
    expect(appended()).toMatchObject({ positions: [], grossExposurePct: 0, shortExposurePct: 0 });
  });
});

describe("POST /api/live/reconcile — snapshot and events", () => {
  it("leaves the benchmark return null — 0 would be a claim", async () => {
    await reconcile();
    expect(appended().benchmarkCumulativeReturnPct).toBeNull();
  });

  it("stamps the agent version and execution mode", async () => {
    await reconcile();
    expect(appended()).toMatchObject({ agentVersion: "2026.08.31", executionMode: "paper" });
  });

  it("reuses an already-appended snapshot instead of failing the run", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.appendSnapshot.mockRejectedValueOnce(new deps.LedgerConflictError("exists"));
    expect((await reconcile()).status).toBe(200);
    spy.mockRestore();
  });

  it("propagates a non-conflict ledger failure", async () => {
    deps.appendSnapshot.mockRejectedValueOnce(new Error("firestore down"));
    await expect(POST(req())).rejects.toThrow("firestore down");
  });

  it("records an event when the drawdown rail trips", async () => {
    deps.evaluateDrawdown.mockReturnValueOnce({
      highWaterMark: 120_000,
      drawdownPct: 16.7,
      frozen: true,
      freezeDaysRemaining: 3,
      tripped: true,
    });
    await reconcile();
    expect(deps.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "2026-08-31-drawdown-tripped",
        kind: "rail_tripped",
        detail: { equity: 100_000, highWaterMark: 120_000 },
      }),
    );
    expect(appended().entriesFrozen).toBe(true);
  });

  it("records no event when the rail holds", async () => {
    await reconcile();
    expect(deps.appendEvent).not.toHaveBeenCalled();
  });

  it("seeds the high-water mark from equity on the first run", async () => {
    await reconcile();
    expect(deps.evaluateDrawdown).toHaveBeenCalledWith(expect.anything(), 100_000, 100_000, 0);
  });

  it("carries the prior high-water mark and freeze countdown forward", async () => {
    deps.getPriorSnapshot.mockResolvedValueOnce({
      inceptionEquity: 100_000,
      highWaterMark: 130_000,
      freezeDaysRemaining: 2,
    });
    await reconcile();
    expect(deps.evaluateDrawdown).toHaveBeenCalledWith(expect.anything(), 100_000, 130_000, 2);
  });

  it("surfaces a blocked broker account", async () => {
    deps.getAccount.mockResolvedValueOnce({
      equity: 100_000,
      cash: 30_000,
      accountBlocked: false,
      tradingBlocked: true,
    });
    expect((await reconcile()).json.accountBlocked).toBe(true);
  });

  it("reports the day's entry count for the decide step's budget", async () => {
    deps.countEntriesToday.mockResolvedValueOnce(2);
    expect((await reconcile()).json.entriesToday).toBe(2);
  });
});
