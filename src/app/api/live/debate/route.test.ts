// Step 7 — one full crew debate per call. The subtle property is the blind
// re-underwrite: the prior thesis AND the book context are withheld, and the run
// is namespaced so the sub-agent cache can't replay the original underwrite —
// without that, the consistency eval would be measuring the cache.
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  runStepFn: vi.fn(),
  runCeoAgent: vi.fn(),
  withCacheScope: vi.fn(),
  withRecallAsOf: vi.fn(),
  getRunAsOf: vi.fn(),
  extractStructured: vi.fn(),
  renderTranscript: vi.fn(),
  buildDecisionContract: vi.fn(() => "CONTRACT"),
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
vi.mock("@/agents/ceo", () => ({ runCeoAgent: deps.runCeoAgent }));
vi.mock("@/lib/agentMemory", () => ({
  withCacheScope: deps.withCacheScope,
  withRecallAsOf: deps.withRecallAsOf,
}));
vi.mock("@/lib/live/runState", () => ({ getRunAsOf: deps.getRunAsOf }));
vi.mock("@/lib/live/extractDecision", () => ({ extractStructured: deps.extractStructured }));
vi.mock("@/lib/live/decisionContract", () => ({
  buildDecisionContract: deps.buildDecisionContract,
}));
vi.mock("@/lib/live/collect", () => ({
  collector: () => ({ emit: vi.fn(), collected: { first: vi.fn(), events: [] } }),
  renderTranscript: deps.renderTranscript,
}));

import { POST } from "./route";

const req = (body?: unknown) =>
  new Request("http://test.local/api/live/debate", {
    method: "POST",
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

async function debate(body?: unknown) {
  const res = await POST(req(body));
  return { status: res.status, json: await res.json() };
}

/** The prompt the CEO agent was handed. */
const ceoPrompt = () => deps.runCeoAgent.mock.calls.at(-1)![0] as string;

const DECISION = { ticker: "AAPL", kind: "entry", targetWeightPct: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  deps.stepNames.length = 0;
  deps.runStepFn.mockResolvedValue(null);
  deps.runCeoAgent.mockResolvedValue(undefined);
  deps.withCacheScope.mockImplementation((_ns: string, fn: () => unknown) => fn());
  deps.withRecallAsOf.mockImplementation((_asOf: string, fn: () => unknown) => fn());
  deps.getRunAsOf.mockResolvedValue("2026-08-31T13:15:00.000Z");
  deps.renderTranscript.mockReturnValue("TRANSCRIPT");
  deps.extractStructured.mockResolvedValue({ ok: true, value: DECISION, attempts: 1 });
});

describe("POST /api/live/debate — the normal path", () => {
  it("runs the crew and returns the extracted decision", async () => {
    const { status, json } = await debate({ ticker: "aapl", mode: "entry" });
    expect(status).toBe(200);
    expect(json).toMatchObject({
      runId: "2026-08-31",
      tradingDay: "2026-08-31",
      ticker: "AAPL",
      mode: "entry",
      blind: false,
      transcript: "TRANSCRIPT",
      decision: DECISION,
      extractionIssues: [],
      extractionAttempts: 1,
    });
  });

  it("records each debate under its own ticker+mode step", async () => {
    await debate({ ticker: "aapl", mode: "entry" });
    expect(deps.stepNames).toEqual(["debate_entry_AAPL"]);
  });

  it("asks for an underwrite on an entry and a hold/trim/exit review on an exit", async () => {
    await debate({ ticker: "AAPL", mode: "entry" });
    expect(ceoPrompt()).toContain("Underwrite AAPL as a new position");

    await debate({ ticker: "AAPL", mode: "exit" });
    expect(ceoPrompt()).toContain("Review the existing position in AAPL");
  });

  it("includes the discovery evidence when the runner passes context", async () => {
    await debate({ ticker: "AAPL", mode: "entry", context: "Wave evidence: margins expanding." });
    expect(ceoPrompt()).toContain("Crew evidence from today's discovery run:");
    expect(ceoPrompt()).toContain("margins expanding");
  });

  it("omits the evidence block when no context is given", async () => {
    await debate({ ticker: "AAPL", mode: "entry" });
    expect(ceoPrompt()).not.toContain("Crew evidence");
  });

  it("always demands a weight, a stated probability and an invalidation", async () => {
    await debate({ ticker: "AAPL", mode: "entry" });
    expect(ceoPrompt()).toContain("target weight");
    expect(ceoPrompt()).toContain("probability");
    expect(ceoPrompt()).toContain("prove you wrong");
  });

  it("constrains an exit extraction to trim/exit/hold", async () => {
    await debate({ ticker: "AAPL", mode: "exit" });
    expect(deps.extractStructured.mock.calls.at(-1)![0].guidance).toContain(
      "trim, exit or hold",
    );
  });

  it("tells the extractor that a rejection is a real recorded decision", async () => {
    await debate({ ticker: "AAPL", mode: "entry" });
    expect(deps.extractStructured.mock.calls.at(-1)![0].guidance).toContain(
      'kind:"reject"',
    );
  });

  it("runs a non-blind debate outside any cache namespace", async () => {
    await debate({ ticker: "AAPL", mode: "entry" });
    expect(deps.withCacheScope).not.toHaveBeenCalled();
  });
});

describe("POST /api/live/debate — the blind re-underwrite", () => {
  it("scrubs the book context so the crew cannot infer a held position", async () => {
    await debate({ ticker: "AAPL", mode: "blind" });
    const [prompt, portfolioContext, , opts] = deps.runCeoAgent.mock.calls[0];
    expect(portfolioContext).toBe("");
    expect(opts).toMatchObject({ holdings: [] });
    expect(prompt).toContain("Do not assume any prior");
    expect(prompt).toContain("seeing for the first time");
  });

  it("namespaces the sub-agent cache per run, so it cannot replay the original", async () => {
    await debate({ ticker: "AAPL", mode: "blind", runId: "2026-08-31" });
    expect(deps.withCacheScope).toHaveBeenCalledWith(
      "blind:2026-08-31:AAPL",
      expect.any(Function),
    );
  });

  it("marks the result blind", async () => {
    const { json } = await debate({ ticker: "AAPL", mode: "blind" });
    expect(json).toMatchObject({ mode: "blind", blind: true });
  });
});

describe("POST /api/live/debate — guards and failures", () => {
  it("records an unextractable debate as a finding about the crew, not an error", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.extractStructured.mockResolvedValueOnce({
      ok: false,
      issues: ["no invalidation stated"],
      attempts: 2,
    });

    const { status, json } = await debate({ ticker: "AAPL", mode: "entry" });
    expect(status).toBe(200);
    expect(json).toMatchObject({
      decision: null,
      extractionIssues: ["no invalidation stated"],
      extractionAttempts: 2,
    });
    // The transcript is still published — the crew's reasoning is the finding.
    expect(json.transcript).toBe("TRANSCRIPT");
    spy.mockRestore();
  });

  it("400s an invalid body", async () => {
    expect((await debate({ mode: "entry" })).status).toBe(400);
    expect((await debate({ ticker: "AAPL" })).status).toBe(400);
    expect((await debate({ ticker: "AAPL", mode: "sell" })).status).toBe(400);
    expect((await debate({ ticker: "TOOLONGTICKER", mode: "entry" })).status).toBe(400);
    expect(
      (await debate({ ticker: "AAPL", mode: "entry", context: "c".repeat(20_001) })).status,
    ).toBe(400);
    expect(deps.runCeoAgent).not.toHaveBeenCalled();
  });

  it("honours an explicit runId", async () => {
    expect((await debate({ ticker: "AAPL", mode: "entry", runId: "manual-1" })).json.runId).toBe(
      "manual-1",
    );
  });

  it("returns the stored result on a replay without re-spending a debate", async () => {
    deps.runStepFn.mockResolvedValueOnce({ runId: "2026-08-31", ticker: "AAPL", decision: DECISION });
    const { json } = await debate({ ticker: "AAPL", mode: "entry" });
    expect(json.replayed).toBe(true);
    expect(deps.runCeoAgent).not.toHaveBeenCalled();
  });
});

describe("POST /api/live/debate — memory recall cutoff", () => {
  it("clips recall to the instant the run was opened with", async () => {
    deps.getRunAsOf.mockResolvedValue("2026-08-31T13:15:00.000Z");

    await debate({ ticker: "AAPL", mode: "entry" });

    expect(deps.withRecallAsOf).toHaveBeenCalledWith(
      "2026-08-31T13:15:00.000Z",
      expect.any(Function)
    );
  });

  it("runs unclipped when the run predates as-of stamping", async () => {
    // A crew that recalls too much is a weaker result, not a corrupted ledger
    // entry — so this degrades rather than refusing the way `decide` does.
    deps.getRunAsOf.mockResolvedValue(null);

    const { status } = await debate({ ticker: "AAPL", mode: "entry" });

    expect(status).toBe(200);
    expect(deps.withRecallAsOf).not.toHaveBeenCalled();
    expect(deps.runCeoAgent).toHaveBeenCalled();
  });

  it("still namespaces the cache on a blind rerun while clipping recall", async () => {
    await debate({ ticker: "AAPL", mode: "blind" });

    expect(deps.withRecallAsOf).toHaveBeenCalled();
    expect(deps.withCacheScope).toHaveBeenCalledWith(
      expect.stringContaining("blind:"),
      expect.any(Function)
    );
  });
});
