// Step 6 — the single LLM ranking pass. The properties worth pinning: a missing
// wave is reported rather than silently synthesised over, and an extracted
// ranking may only carry names the scout actually shortlisted.
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  runStepFn: vi.fn(),
  runDiscoverySynthesis: vi.fn(),
  getStepResult: vi.fn(),
  mergeWaves: vi.fn(),
  extractStructured: vi.fn(),
  renderTranscript: vi.fn(),
  finalReport: vi.fn(),
  events: [] as unknown[],
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
vi.mock("@/agents/discovery", () => ({ runDiscoverySynthesis: deps.runDiscoverySynthesis }));
vi.mock("@/lib/live/runState", () => ({ getStepResult: deps.getStepResult }));
vi.mock("@/lib/discoveryRun", () => ({ mergeWaves: deps.mergeWaves }));
vi.mock("@/lib/live/extractDecision", () => ({ extractStructured: deps.extractStructured }));
vi.mock("@/lib/live/collect", () => ({
  collector: () => ({ emit: vi.fn(), collected: { first: vi.fn(), events: deps.events } }),
  renderTranscript: deps.renderTranscript,
  finalReport: deps.finalReport,
}));

import { POST } from "./route";

const req = (body?: unknown) =>
  new Request("http://test.local/api/live/discover/synthesize", {
    method: "POST",
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

async function synthesize(body?: unknown) {
  const res = await POST(req(body));
  return { status: res.status, json: await res.json() };
}

const PICKS = [{ ticker: "AAPL" }, { ticker: "MSFT" }, { ticker: "NVDA" }];

/** Scout result plus `totalWaves` completed waves. */
function seedSteps(totalWaves = 2, completed = totalWaves) {
  deps.getStepResult.mockImplementation(async (_runId: string, step: string) => {
    if (step === "scout") return { picks: PICKS, query: "standing query", totalWaves };
    const i = Number(step.replace("wave_", ""));
    return i < completed ? { wave: { tickers: ["AAPL"] } } : null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.events.length = 0;
  deps.events.push({ type: "text" }, { type: "text" });
  deps.runStepFn.mockResolvedValue(null);
  deps.runDiscoverySynthesis.mockResolvedValue(undefined);
  deps.mergeWaves.mockReturnValue({ merged: true });
  deps.renderTranscript.mockReturnValue("TRANSCRIPT");
  deps.finalReport.mockReturnValue("FINAL REPORT");
  deps.extractStructured.mockResolvedValue({
    ok: true,
    value: { ranked: [{ ticker: "aapl" }, { ticker: "MSFT" }] },
  });
  seedSteps();
});

describe("POST /api/live/discover/synthesize", () => {
  it("ranks the shortlist and returns the debate subjects", async () => {
    const { status, json } = await synthesize();
    expect(status).toBe(200);
    expect(json).toMatchObject({
      runId: "2026-08-31",
      tradingDay: "2026-08-31",
      transcript: "TRANSCRIPT",
      events: 2,
      subjects: ["AAPL", "MSFT"],
      rankingIssues: [],
    });
  });

  it("feeds the synthesis every wave's merged evidence", async () => {
    await synthesize();
    expect(deps.mergeWaves).toHaveBeenCalledWith([{ tickers: ["AAPL"] }, { tickers: ["AAPL"] }]);
    expect(deps.runDiscoverySynthesis).toHaveBeenCalledWith(
      { synthesize: true, query: "standing query", picks: PICKS, evidence: { merged: true } },
      expect.any(Function),
    );
  });

  it("extracts the ranking from the FINAL report, not the whole event stream", async () => {
    await synthesize();
    expect(deps.extractStructured).toHaveBeenCalledWith(
      expect.objectContaining({ report: "FINAL REPORT" }),
    );
  });

  it("falls back to the transcript when there is no final report", async () => {
    deps.finalReport.mockReturnValueOnce(null);
    await synthesize();
    expect(deps.extractStructured).toHaveBeenCalledWith(
      expect.objectContaining({ report: "TRANSCRIPT" }),
    );
  });

  it("drops a hallucinated ticker the scout never shortlisted", async () => {
    deps.extractStructured.mockResolvedValueOnce({
      ok: true,
      value: { ranked: [{ ticker: "AAPL" }, { ticker: "FAKE" }] },
    });
    expect((await synthesize()).json.subjects).toEqual(["AAPL"]);
  });

  it("surfaces the extraction issues and ranks nothing when extraction fails", async () => {
    deps.extractStructured.mockResolvedValueOnce({ ok: false, issues: ["no ranked list found"] });
    const { json } = await synthesize();
    expect(json.subjects).toEqual([]);
    expect(json.rankingIssues).toEqual(["no ranked list found"]);
  });

  it("409s when the scout step has not run", async () => {
    deps.getStepResult.mockResolvedValue(null);
    const { status, json } = await synthesize();
    expect(status).toBe(409);
    expect(json.error).toMatchObject({ code: "out_of_order" });
    expect(deps.runDiscoverySynthesis).not.toHaveBeenCalled();
  });

  it("409s — naming the gaps — rather than synthesising over partial evidence", async () => {
    seedSteps(3, 1);
    const { status, json } = await synthesize();
    expect(status).toBe(409);
    expect(json.error).toMatchObject({ code: "incomplete_evidence" });
    expect(json.error.message).toContain("1, 2");
    expect(deps.runDiscoverySynthesis).not.toHaveBeenCalled();
  });

  it("400s an invalid body and tolerates an unparseable one", async () => {
    expect((await synthesize({ runId: "" })).status).toBe(400);
    expect((await synthesize("{not json")).status).toBe(200);
  });

  it("honours an explicit runId", async () => {
    await synthesize({ runId: "manual-1" });
    expect(deps.getStepResult).toHaveBeenCalledWith("manual-1", "scout");
  });

  it("returns the stored result on a replay without a second model pass", async () => {
    deps.runStepFn.mockResolvedValueOnce({ runId: "2026-08-31", subjects: ["AAPL"] });
    const { json } = await synthesize();
    expect(json.replayed).toBe(true);
    expect(deps.runDiscoverySynthesis).not.toHaveBeenCalled();
  });
});
