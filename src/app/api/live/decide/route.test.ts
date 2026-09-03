// The deterministic decision engine — the step where the mandate is applied and
// NO model runs. The properties worth pinning: a rail refusal downgrades a
// decision to a recorded rejection rather than deleting it, an unscorable debate
// becomes a ledger event rather than a silent drop, and the whole step is
// idempotent. The real DecisionRecordSchema is used so validation is genuine.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrewDecision } from "@/lib/schemas/live/decision";

const deps = vi.hoisted(() => ({
  runStepFn: vi.fn(),
  getRunState: vi.fn(),
  candidateFacts: vi.fn(),
  checkEntry: vi.fn(),
  checkExit: vi.fn(),
  appendDecision: vi.fn(),
  appendEvent: vi.fn(),
  LedgerConflictError: class LedgerConflictError extends Error {},
}));

vi.mock("@/lib/live/harness", () => ({
  // Pass-through: authorization is covered by liveRoutes.test.ts. The real
  // wrapper also maps a thrown step error to a 500, so here one surfaces as a throw.
  withHarness: (h: (req: Request) => Promise<Response>) => h,
  easternDay: () => "2026-08-31",
  runStep: async (_runId: string, _step: string, fn: () => Promise<unknown>) => {
    const replayed = await deps.runStepFn();
    if (replayed) return { result: replayed, replayed: true };
    return { result: await fn(), replayed: false };
  },
}));
vi.mock("@/lib/live/runState", () => ({ getRunState: deps.getRunState }));
vi.mock("@/lib/live/transcripts", () => ({
  transcriptId: (runId: string, ticker: string, mode: string) =>
    `${runId}-${ticker.toUpperCase()}-${mode}`,
  transcriptRef: (id: string) => `liveTranscripts/${id}`,
}));
vi.mock("@/lib/live/candidateFacts", () => ({ candidateFacts: deps.candidateFacts }));
vi.mock("@/lib/live/mandate", () => ({ checkEntry: deps.checkEntry, checkExit: deps.checkExit }));
vi.mock("@/lib/live/ledger", () => ({
  appendDecision: deps.appendDecision,
  appendEvent: deps.appendEvent,
  decisionId: (day: string, ticker: string, kind: string) => `${day}-${ticker}-${kind}`,
  LedgerConflictError: deps.LedgerConflictError,
}));
vi.mock("@/lib/live/version", () => ({ AGENT_VERSION: "2026.08.31" }));
vi.mock("@/lib/live/promptHash", () => ({ promptHash: () => "a".repeat(64) }));

import { POST } from "./route";

const req = (body?: unknown) =>
  new Request("http://test.local/api/live/decide", {
    method: "POST",
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

function crewDecision(over: Partial<CrewDecision> = {}): CrewDecision {
  return {
    ticker: "AAPL",
    kind: "entry",
    thesis: "Services mix is re-rating the multiple.",
    stated: { probability: 0.6, horizonDays: 21, expectedReturnPct: 8 },
    invalidation: [
      {
        id: "inv1",
        metric: "price_vs_entry_pct",
        operator: "lt",
        threshold: -12,
        unit: "pct",
        source: "alpaca_snapshot",
        consecutive: 1,
        statement: "Down 12% from entry.",
        horizonDays: 21,
      },
    ],
    votes: [
      { agent: "bull", role: "bull", stance: "buy", confidence: 0.7, summary: "Margins.", citations: [] },
    ],
    dissent: "Hardware demand could roll over.",
    targetWeightPct: 5,
    ...over,
  } as CrewDecision;
}

function debateStep(over: Record<string, unknown> = {}) {
  return {
    ticker: "AAPL",
    mode: "entry",
    blind: false,
    transcript: "…",
    decision: crewDecision(),
    extractionIssues: [],
    ...over,
  };
}

/** The as-of every fixture run was opened with. */
const AS_OF = "2026-09-08T13:15:00.000Z";

/** A run state that has passed session open and reconcile, with the given debates. */
function runState(debates: Record<string, unknown>[] = [debateStep()], snapshotOver = {}) {
  const steps: Record<string, unknown> = {
    session_open: { done: true, result: { asOf: AS_OF } },
    reconcile: {
      done: true,
      result: {
        entriesToday: 0,
        snapshot: { equity: 100_000, cashPct: 30, positions: [], entriesFrozen: false, ...snapshotOver },
      },
    },
  };
  debates.forEach((d, i) => {
    steps[`debate_${i}`] = { done: true, result: d };
  });
  return { steps };
}

async function decide(body?: unknown) {
  const res = await POST(req(body));
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.runStepFn.mockResolvedValue(null);
  deps.getRunState.mockResolvedValue(runState());
  deps.candidateFacts.mockResolvedValue({ dataGaps: [] });
  deps.checkEntry.mockReturnValue({ allowed: true, checks: [], allowedWeightPct: 5 });
  deps.checkExit.mockReturnValue({ allowed: true, checks: [], allowedWeightPct: 0 });
  deps.appendDecision.mockResolvedValue(undefined);
  deps.appendEvent.mockResolvedValue(undefined);
});

describe("POST /api/live/decide — ordering", () => {
  it("409s when the run does not exist", async () => {
    deps.getRunState.mockResolvedValueOnce(null);
    const { status, json } = await decide();
    expect(status).toBe(409);
    expect(json.error).toMatchObject({ code: "out_of_order" });
  });

  it("409s when reconcile has not run", async () => {
    deps.getRunState.mockResolvedValueOnce({
      steps: { session_open: { done: true, result: { asOf: AS_OF } } },
    });
    expect((await decide()).status).toBe(409);
  });

  it("409s when reconcile is recorded but produced no result", async () => {
    deps.getRunState.mockResolvedValueOnce({
      steps: {
        session_open: { done: true, result: { asOf: AS_OF } },
        reconcile: { done: true },
      },
    });
    expect((await decide()).status).toBe(409);
  });

  it("400s an invalid body", async () => {
    const { status, json } = await decide({ runId: "" });
    expect(status).toBe(400);
    expect(json.error).toMatchObject({ code: "validation_error" });
  });

  it("defaults the runId to today's ET trading day", async () => {
    await decide();
    expect(deps.getRunState).toHaveBeenCalledWith("2026-08-31");
  });

  it("honours an explicit runId", async () => {
    await decide({ runId: "2026-08-28" });
    expect(deps.getRunState).toHaveBeenCalledWith("2026-08-28");
  });

  it("treats an unparseable body as empty rather than failing", async () => {
    expect((await decide("{not json")).status).toBe(200);
  });

  it("returns the stored result without re-deciding on a replay", async () => {
    deps.runStepFn.mockResolvedValueOnce({ runId: "2026-08-31", decisions: [], entries: 0 });
    const { json } = await decide();
    expect(json.replayed).toBe(true);
    expect(deps.appendDecision).not.toHaveBeenCalled();
  });
});

describe("POST /api/live/decide — records", () => {
  it("writes an allowed entry to the ledger with the harness-supplied facts", async () => {
    const { status, json } = await decide();
    expect(status).toBe(200);
    expect(json).toMatchObject({ runId: "2026-08-31", tradingDay: "2026-08-31", entries: 1, rejects: 0 });

    const [record] = deps.appendDecision.mock.calls[0];
    expect(record).toMatchObject({
      schemaVersion: 2,
      // The instant the crew was entitled to know things as of, carried from
      // session open rather than re-derived when `decide` happened to run.
      asOf: AS_OF,
      decisionId: "2026-08-31-AAPL-entry",
      ticker: "AAPL",
      kind: "entry",
      targetWeightPct: 5,
      agentVersion: "2026.08.31",
      promptHash: "a".repeat(64),
      transcriptRef: "liveTranscripts/2026-08-31-AAPL-entry",
    });
  });

  it("uppercases the ticker on the record", async () => {
    deps.getRunState.mockResolvedValueOnce(
      runState([debateStep({ decision: crewDecision({ ticker: "aapl" }) })]),
    );
    await decide();
    expect(deps.appendDecision.mock.calls[0][0].ticker).toBe("AAPL");
  });

  it("DOWNGRADES a rail-refused entry to a recorded rejection at zero weight", async () => {
    deps.checkEntry.mockReturnValueOnce({
      allowed: false,
      checks: [{ rule: "sector_concentration", passed: false, detail: "Tech already 35%" }],
      allowedWeightPct: 0,
    });

    const { json } = await decide();
    expect(json).toMatchObject({ entries: 0, rejects: 1 });

    const [record] = deps.appendDecision.mock.calls[0];
    expect(record).toMatchObject({
      kind: "reject",
      targetWeightPct: 0,
      decisionId: "2026-08-31-AAPL-reject",
      // The crew's view survives the refusal — that is what keeps the
      // counterfactual cohort whole.
      thesis: "Services mix is re-rating the multiple.",
      mandateChecks: [{ rule: "sector_concentration", passed: false, detail: "Tech already 35%" }],
    });
  });

  it("routes exits and trims through the exit rail with the held duration", async () => {
    deps.getRunState.mockResolvedValueOnce(
      runState(
        [debateStep({ decision: crewDecision({ kind: "exit", targetWeightPct: 0 }) })],
        {
          positions: [
            { ticker: "AAPL", openedOn: "2026-08-24", openedByDecisionId: "2026-08-24-AAPL-entry" },
          ],
        },
      ),
    );
    await decide();
    // 2026-08-24 (Mon) → 2026-08-31 (Mon) is five trading days.
    expect(deps.checkExit).toHaveBeenCalledWith(expect.anything(), "invalidation", 5);
    expect(deps.checkEntry).not.toHaveBeenCalled();
  });

  it("labels a blind re-underwrite exit as a reunderwrite", async () => {
    deps.getRunState.mockResolvedValueOnce(
      runState([
        debateStep({ blind: true, mode: "blind", decision: crewDecision({ kind: "trim", targetWeightPct: 2 }) }),
      ]),
    );
    await decide();
    expect(deps.checkExit).toHaveBeenCalledWith(expect.anything(), "reunderwrite", 0);
    expect(deps.appendDecision.mock.calls[0][0].blindReunderwrite).toBe(true);
  });

  it("links an exit to the decision that opened the position", async () => {
    deps.getRunState.mockResolvedValueOnce(
      runState([debateStep({ decision: crewDecision({ kind: "exit", targetWeightPct: 0 }) })], {
        positions: [
          { ticker: "AAPL", openedOn: "2026-08-24", openedByDecisionId: "2026-08-24-AAPL-entry" },
        ],
      }),
    );
    await decide();
    expect(deps.appendDecision.mock.calls[0][0].priorDecisionId).toBe("2026-08-24-AAPL-entry");
  });

  it("needs no rail permission for a hold", async () => {
    deps.getRunState.mockResolvedValueOnce(
      runState([debateStep({ decision: crewDecision({ kind: "hold", targetWeightPct: 0 }) })]),
    );
    const { json } = await decide();
    expect(deps.checkEntry).not.toHaveBeenCalled();
    expect(deps.checkExit).not.toHaveBeenCalled();
    expect(json.decisions[0]).toMatchObject({ kind: "hold", targetWeightPct: 0 });
  });

  it("carries the candidate's data gaps onto the record", async () => {
    const gaps = [{ field: "fcf_ttm", status: "unavailable", source: "edgar_xbrl" }];
    deps.candidateFacts.mockResolvedValueOnce({ dataGaps: gaps });
    await decide();
    expect(deps.appendDecision.mock.calls[0][0].dataGaps).toEqual(gaps);
  });

  it("counts each recorded entry against the day's entry budget", async () => {
    deps.getRunState.mockResolvedValueOnce(
      runState([
        debateStep(),
        debateStep({ decision: crewDecision({ ticker: "MSFT" }) }),
      ]),
    );
    // The route hands checkEntry ONE mutable `book`, so the recorded call args
    // alias it — read entriesToday at call time, not from mock.calls afterwards.
    const seen: number[] = [];
    deps.checkEntry.mockImplementation((_m: unknown, book: { entriesToday: number }) => {
      seen.push(book.entriesToday);
      return { allowed: true, checks: [], allowedWeightPct: 5 };
    });

    await decide();
    expect(seen).toEqual([0, 1]);
  });

  it("keeps the original when the decision was already appended", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.appendDecision.mockRejectedValueOnce(new deps.LedgerConflictError("exists"));
    const { status, json } = await decide();
    expect(status).toBe(200);
    expect(json.decisions).toHaveLength(0);
    spy.mockRestore();
  });

  it("propagates a non-conflict ledger failure", async () => {
    deps.appendDecision.mockRejectedValueOnce(new Error("firestore down"));
    await expect(POST(req())).rejects.toThrow("firestore down");
  });
});

describe("POST /api/live/decide — unscorable debates", () => {
  it("records a thesis-less debate as an event instead of dropping it", async () => {
    deps.getRunState.mockResolvedValueOnce(
      runState([debateStep({ decision: null, extractionIssues: ["no invalidation stated"] })]),
    );

    const { json } = await decide();
    expect(json.unscorable).toEqual([{ ticker: "AAPL", issues: ["no invalidation stated"] }]);
    expect(deps.appendDecision).not.toHaveBeenCalled();
    expect(deps.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "2026-08-31-unscorable-AAPL",
        kind: "correction",
        detail: { issues: ["no invalidation stated"] },
      }),
    );
  });

  it("records a schema-invalid record as unscorable rather than appending it", async () => {
    // probability must sit on the 0.05 grid — 0.63 does not.
    deps.getRunState.mockResolvedValueOnce(
      runState([
        debateStep({
          decision: crewDecision({
            stated: { probability: 0.63, horizonDays: 21, expectedReturnPct: 8 },
          }),
        }),
      ]),
    );

    const { json } = await decide();
    expect(deps.appendDecision).not.toHaveBeenCalled();
    expect(json.unscorable[0].ticker).toBe("AAPL");
    expect(json.unscorable[0].issues[0]).toContain("stated.probability");
  });

  it("keeps scoring the other candidates when one is unscorable", async () => {
    deps.getRunState.mockResolvedValueOnce(
      runState([
        debateStep({ decision: null, extractionIssues: ["garbled"] }),
        debateStep({ decision: crewDecision({ ticker: "MSFT" }) }),
      ]),
    );
    const { json } = await decide();
    expect(json.entries).toBe(1);
    expect(json.unscorable).toHaveLength(1);
  });

  it("returns empty tallies when there were no debates at all", async () => {
    deps.getRunState.mockResolvedValueOnce(runState([]));
    const { json } = await decide();
    expect(json).toMatchObject({ decisions: [], entries: 0, rejects: 0, unscorable: [] });
    expect(deps.appendEvent).not.toHaveBeenCalled();
  });
});
