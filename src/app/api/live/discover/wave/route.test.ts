// Step 5 — one deterministic crew wave per call. The property worth pinning: the
// wave plan is RE-DERIVED from the stored shortlist, so the runner cannot hand a
// wave a ticker the scout never picked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  runStepFn: vi.fn(),
  runDiscoveryWave: vi.fn(),
  planWaves: vi.fn(),
  getStepResult: vi.fn(),
  first: vi.fn(),
  stepNames: [] as string[],
}));

vi.mock("@/lib/live/harness", () => ({
  withHarness: (h: (req: Request) => Promise<Response>) => h,
  easternDay: () => "2026-08-31",
  runStep: async (_runId: string, step: string, fn: () => Promise<unknown>) => {
    deps.stepNames.push(step);
    const replayed = await deps.runStepFn();
    if (replayed) return { result: replayed, replayed: true };
    return { result: await fn(), replayed: false };
  },
}));
// The harness runs the lean triage crew; the full crew stays with Discover.
// Hoisted, because the vi.mock factory below is hoisted above plain consts.
const TRIAGE_WAVE_AGENTS = vi.hoisted(() => ({
  batch: ["run_news_agent"],
  valuation: ["run_fundamentals_agent"],
}));
vi.mock("@/agents/discovery", () => ({
  runDiscoveryWave: deps.runDiscoveryWave,
  TRIAGE_WAVE_AGENTS,
}));
vi.mock("@/lib/discoveryRun", () => ({ planWaves: deps.planWaves }));
vi.mock("@/lib/live/runState", () => ({ getStepResult: deps.getStepResult }));
vi.mock("@/lib/live/collect", () => ({
  collector: () => ({ emit: vi.fn(), collected: { first: deps.first, events: [] } }),
}));

import { POST } from "./route";

const req = (body?: unknown) =>
  new Request("http://test.local/api/live/discover/wave", {
    method: "POST",
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

async function wave(body?: unknown) {
  const res = await POST(req(body));
  return { status: res.status, json: await res.json() };
}

const PICKS = [{ ticker: "AAPL" }, { ticker: "MSFT" }];
const WAVES = [{ tickers: ["AAPL"] }, { tickers: ["MSFT"] }];

beforeEach(() => {
  vi.clearAllMocks();
  deps.stepNames.length = 0;
  deps.runStepFn.mockResolvedValue(null);
  deps.getStepResult.mockResolvedValue({ picks: PICKS });
  deps.planWaves.mockReturnValue(WAVES);
  deps.runDiscoveryWave.mockResolvedValue(undefined);
  deps.first.mockReturnValue({ wave: { tickers: ["AAPL"], evidence: {} } });
});

describe("POST /api/live/discover/wave", () => {
  it("runs the requested wave and returns its evidence", async () => {
    const { status, json } = await wave({ waveIndex: 0 });
    expect(status).toBe(200);
    expect(json).toMatchObject({
      runId: "2026-08-31",
      tradingDay: "2026-08-31",
      waveIndex: 0,
      totalWaves: 2,
      wave: { tickers: ["AAPL"] },
    });
    expect(deps.runDiscoveryWave).toHaveBeenCalledWith(
      { ...WAVES[0], agents: TRIAGE_WAVE_AGENTS },
      expect.any(Function),
    );
  });

  it("re-derives the plan from the stored shortlist, not from the request", async () => {
    await wave({ waveIndex: 1 });
    expect(deps.getStepResult).toHaveBeenCalledWith("2026-08-31", "scout");
    expect(deps.planWaves).toHaveBeenCalledWith(PICKS);
    expect(deps.runDiscoveryWave).toHaveBeenCalledWith(
      { ...WAVES[1], agents: TRIAGE_WAVE_AGENTS },
      expect.any(Function),
    );
  });

  it("records each wave under its own step so a rerun replays just that wave", async () => {
    await wave({ waveIndex: 1 });
    expect(deps.stepNames).toEqual(["wave_1"]);
  });

  it("409s when the scout step has not run", async () => {
    deps.getStepResult.mockResolvedValueOnce(null);
    const { status, json } = await wave({ waveIndex: 0 });
    expect(status).toBe(409);
    expect(json.error).toMatchObject({ code: "out_of_order" });
    expect(deps.runDiscoveryWave).not.toHaveBeenCalled();
  });

  it("400s a waveIndex this run never planned", async () => {
    const { status, json } = await wave({ waveIndex: 5 });
    expect(status).toBe(400);
    expect(json.error).toMatchObject({ code: "out_of_range" });
    expect(json.error.details ?? json.error.message).toBeTruthy();
    expect(deps.runDiscoveryWave).not.toHaveBeenCalled();
  });

  it("400s a missing or out-of-bounds waveIndex", async () => {
    expect((await wave({})).status).toBe(400);
    expect((await wave({ waveIndex: -1 })).status).toBe(400);
    expect((await wave({ waveIndex: 21 })).status).toBe(400);
    expect((await wave({ waveIndex: 1.5 })).status).toBe(400);
  });

  it("honours an explicit runId", async () => {
    await wave({ waveIndex: 0, runId: "manual-1" });
    expect(deps.getStepResult).toHaveBeenCalledWith("manual-1", "scout");
  });

  it("fails when the wave produced no evidence", async () => {
    deps.first.mockReturnValueOnce(null);
    await expect(POST(req({ waveIndex: 0 }))).rejects.toThrow("Wave 0 produced no evidence");
  });

  it("returns the stored result on a replay without re-running the crew", async () => {
    deps.runStepFn.mockResolvedValueOnce({ runId: "2026-08-31", waveIndex: 0, wave: {} });
    const { json } = await wave({ waveIndex: 0 });
    expect(json.replayed).toBe(true);
    expect(deps.runDiscoveryWave).not.toHaveBeenCalled();
  });
});
