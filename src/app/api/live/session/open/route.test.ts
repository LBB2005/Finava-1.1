// Step 1 — the gates: ask the EXCHANGE whether today is a session (never the
// cron's own clock), refuse a run whose budget is already spent, and pre-warm the
// factor memo without letting its failure kill the day.
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  runStepFn: vi.fn(),
  alpacaTradingConfigured: vi.fn(),
  getCalendar: vi.fn(),
  isTradingDay: vi.fn(),
  getFactorUniverse: vi.fn(),
  readBudget: vi.fn(),
}));

vi.mock("@/lib/live/harness", () => ({
  withHarness: (h: (req: Request) => Promise<Response>) => h,
  easternDay: () => "2026-08-31",
  runStep: async (_runId: string, _step: string, fn: () => Promise<unknown>) => {
    const replayed = await deps.runStepFn();
    if (replayed) return { result: replayed, replayed: true };
    return { result: await fn(), replayed: false };
  },
}));
vi.mock("@/lib/live/budget", () => ({ readBudget: deps.readBudget }));
vi.mock("@/lib/alpacaTrading", () => ({
  alpacaTradingConfigured: deps.alpacaTradingConfigured,
  getCalendar: deps.getCalendar,
  isTradingDay: deps.isTradingDay,
}));
vi.mock("@/lib/factorUniverse", () => ({ getFactorUniverse: deps.getFactorUniverse }));

import { POST } from "./route";

const req = () => new Request("http://test.local/api/live/session/open", { method: "POST" });

async function open() {
  const res = await POST(req());
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.runStepFn.mockResolvedValue(null);
  deps.alpacaTradingConfigured.mockReturnValue(true);
  deps.readBudget.mockResolvedValue({ exhausted: false, spent: 10, cap: 500 });
  deps.getCalendar.mockResolvedValue([{ date: "2026-08-31", open: "09:30", close: "16:00" }]);
  deps.isTradingDay.mockReturnValue(true);
  deps.getFactorUniverse.mockResolvedValue({ stocks: new Array(487).fill({ ticker: "X" }) });
});

describe("POST /api/live/session/open", () => {
  it("opens the run, reports the session window and the warmed universe size", async () => {
    const { status, json } = await open();
    expect(status).toBe(200);
    expect(json).toMatchObject({
      runId: "2026-08-31",
      tradingDay: "2026-08-31",
      skip: false,
      sessionOpen: "09:30",
      sessionClose: "16:00",
      universeSize: 487,
      replayed: false,
    });
  });

  it("keys the run on the ET trading day so a replay lands on the same document", async () => {
    const { json } = await open();
    expect(json.runId).toBe(json.tradingDay);
  });

  it("asks the exchange calendar rather than trusting the trigger clock", async () => {
    await open();
    expect(deps.getCalendar).toHaveBeenCalledWith("2026-08-31", "2026-08-31");
    expect(deps.isTradingDay).toHaveBeenCalledWith(
      [{ date: "2026-08-31", open: "09:30", close: "16:00" }],
      "2026-08-31",
    );
  });

  it("skips a holiday cleanly instead of producing an empty day", async () => {
    deps.isTradingDay.mockReturnValueOnce(false);
    const { status, json } = await open();
    expect(status).toBe(200);
    expect(json).toMatchObject({ skip: true, reason: "not a trading session", universeSize: 0 });
    expect(deps.getFactorUniverse).not.toHaveBeenCalled();
  });

  it("nulls the session window when the calendar row is missing", async () => {
    deps.getCalendar.mockResolvedValueOnce([]);
    const { json } = await open();
    expect(json).toMatchObject({ sessionOpen: null, sessionClose: null });
  });

  it("503s when Alpaca is not configured", async () => {
    deps.alpacaTradingConfigured.mockReturnValueOnce(false);
    const { status, json } = await open();
    expect(status).toBe(503);
    expect(json.error).toMatchObject({ code: "not_configured" });
    expect(deps.readBudget).not.toHaveBeenCalled();
  });

  it("429s a run whose budget an earlier partial run already spent", async () => {
    deps.readBudget.mockResolvedValueOnce({ exhausted: true, spent: 500, cap: 500 });
    const { status, json } = await open();
    expect(status).toBe(429);
    expect(json.error).toMatchObject({ code: "budget_exceeded" });
    expect(deps.getCalendar).not.toHaveBeenCalled();
  });

  it("reports the budget alongside the result", async () => {
    const { json } = await open();
    expect(json.budget).toEqual({ exhausted: false, spent: 10, cap: 500 });
  });

  it("survives a failed pre-warm — the scout can still fetch the universe", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.getFactorUniverse.mockRejectedValueOnce(new Error("polygon 503"));
    const { status, json } = await open();
    expect(status).toBe(200);
    expect(json).toMatchObject({ skip: false, universeSize: 0 });
    spy.mockRestore();
  });

  it("returns the stored result on a replay without re-warming", async () => {
    deps.runStepFn.mockResolvedValueOnce({ runId: "2026-08-31", skip: false, universeSize: 487 });
    const { json } = await open();
    expect(json.replayed).toBe(true);
    expect(deps.getCalendar).not.toHaveBeenCalled();
  });
});
