// Step 9 — the publication payload. It writes nothing (so a failed export can be
// retried freely), it publishes transcripts and the rejected cohort in full, and
// it returns the content hash the execute step later checks the commit against.
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  getRunState: vi.fn(),
  getSnapshot: vi.fn(),
  getDecisionsForDay: vi.fn(),
  getChainHeads: vi.fn(),
  executionMode: vi.fn(() => "paper"),
  provenance: vi.fn(() => ({ agentVersion: "2026.08.31", commit: "abc123", promptHash: "f".repeat(64) })),
  scoringRegistration: vi.fn(() => ({ method: "forward-return", hash: "e".repeat(64) })),
}));

vi.mock("@/lib/live/harness", () => ({
  withHarness: (h: (req: Request) => Promise<Response>) => h,
}));
vi.mock("@/lib/live/runState", () => ({ getRunState: deps.getRunState }));
vi.mock("@/lib/live/ledgerRead", () => ({
  getSnapshot: deps.getSnapshot,
  getDecisionsForDay: deps.getDecisionsForDay,
}));
vi.mock("@/lib/live/transcripts", () => ({
  readTranscript: (id: string) => Promise.resolve(`resolved:${id}`),
}));
vi.mock("@/lib/live/ledger", () => ({
  getChainHeads: deps.getChainHeads,
  canonicalJson: (v: unknown) => JSON.stringify(v),
  hashEntry: (_v: unknown, prev: string) => `hash(${prev})`,
  CHAIN_GENESIS: "0".repeat(64),
}));
vi.mock("@/lib/live/version", () => ({ executionMode: deps.executionMode }));
vi.mock("@/lib/live/promptHash", () => ({ provenance: deps.provenance }));
vi.mock("@/lib/live/scoring", () => ({ scoringRegistration: deps.scoringRegistration }));

import { DISCLAIMER, GET, lastStepAt } from "./route";

const req = (runId: string) =>
  new Request(`http://test.local/api/live/run/${runId}/export`);

async function exportDay(runId = "2026-08-31") {
  const res = await GET(req(runId));
  return { status: res.status, json: await res.json() };
}

function decision(over: Record<string, unknown> = {}) {
  return { kind: "entry", blindReunderwrite: false, ticker: "AAPL", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.getRunState.mockResolvedValue({
    creditsSpent: 240,
    steps: {
      session_open: { at: "2026-08-31T13:00:00.000Z", result: { skip: false } },
      debate_entry_AAPL: {
        at: "2026-08-31T14:00:00.000Z",
        result: { transcript: "AAPL debate", ticker: "AAPL", mode: "entry" },
      },
    },
  });
  deps.getSnapshot.mockResolvedValue({ tradingDay: "2026-08-31", equity: 100_000 });
  deps.getDecisionsForDay.mockResolvedValue([decision()]);
  deps.getChainHeads.mockResolvedValue({ heads: { liveDecisions: "d".repeat(64) } });
});

describe("GET /api/live/run/[runId]/export", () => {
  it("returns the two publishable files and a content hash", async () => {
    const { status, json } = await exportDay();
    expect(status).toBe(200);
    expect(json.runId).toBe("2026-08-31");
    expect(json.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(json.files)).toEqual([
      "days/2026-08-31/day.json",
      "days/2026-08-31/transcripts.json",
    ]);
  });

  it("writes nothing — the export can be retried without altering the record", async () => {
    await exportDay();
    // Only read helpers are wired; a write would have to come from one of these.
    expect(deps.getRunState).toHaveBeenCalledTimes(1);
    expect(deps.getSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.getDecisionsForDay).toHaveBeenCalledTimes(1);
  });

  it("carries the mandate, provenance, scoring registration and snapshot", async () => {
    const day = (await exportDay()).json.files["days/2026-08-31/day.json"];
    expect(day).toMatchObject({
      tradingDay: "2026-08-31",
      executionMode: "paper",
      agentVersion: "2026.08.31",
      commit: "abc123",
      scoring: { method: "forward-return" },
      snapshot: { equity: 100_000 },
      creditsSpent: 240,
    });
    expect(day.mandate).toBeTruthy();
    // Derived from the run, not from the clock — see the regression test below.
    expect(day.runCompletedAt).toBe("2026-08-31T14:00:00.000Z");
    expect(day).not.toHaveProperty("generatedAt");
  });

  it("counts entries, exits, rejections and blind re-underwrites separately", async () => {
    deps.getDecisionsForDay.mockResolvedValueOnce([
      decision({ kind: "entry" }),
      decision({ kind: "entry" }),
      decision({ kind: "exit" }),
      decision({ kind: "reject" }),
      decision({ kind: "hold", blindReunderwrite: true }),
    ]);
    const day = (await exportDay()).json.files["days/2026-08-31/day.json"];
    expect(day.counts).toEqual({ entries: 2, exits: 1, rejects: 1, blindReunderwrites: 1 });
  });

  it("publishes the rejected cohort in the decisions list, not just the tally", async () => {
    deps.getDecisionsForDay.mockResolvedValueOnce([decision({ kind: "reject", ticker: "TSLA" })]);
    const day = (await exportDay()).json.files["days/2026-08-31/day.json"];
    expect(day.decisions).toEqual([
      { kind: "reject", blindReunderwrite: false, ticker: "TSLA" },
    ]);
  });

  it("keys each transcript by ticker and mode", async () => {
    const { json } = await exportDay();
    expect(json.files["days/2026-08-31/transcripts.json"]).toEqual({
      "AAPL-entry": "AAPL debate",
    });
  });

  it("falls back to the step name for a transcript with no ticker", async () => {
    deps.getRunState.mockResolvedValueOnce({
      creditsSpent: 0,
      steps: { synthesize: { result: { transcript: "ranking pass" } } },
    });
    const { json } = await exportDay();
    expect(json.files["days/2026-08-31/transcripts.json"]).toEqual({
      synthesize: "ranking pass",
    });
  });

  it("skips steps that produced no transcript", async () => {
    const { json } = await exportDay();
    expect(json.files["days/2026-08-31/transcripts.json"]).not.toHaveProperty("session_open");
  });

  it("always carries the disclaimer", async () => {
    const day = (await exportDay()).json.files["days/2026-08-31/day.json"];
    expect(day.disclaimer).toBe(DISCLAIMER);
    expect(DISCLAIMER).toContain("No real money is at risk");
    expect(DISCLAIMER).toContain("Nothing in this repository is investment advice");
    expect(DISCLAIMER).toContain("published so that they can be scored");
  });

  it("publishes the chain heads and a recomputable verification recipe", async () => {
    const { json } = await exportDay();
    expect(json.verify).toEqual({
      method: "sha256(canonicalJson(payload) + prevHash), chained per collection",
      genesis: "0".repeat(64),
      heads: { liveDecisions: "d".repeat(64) },
      example: `hash(${"0".repeat(64)})`,
    });
  });

  it("hashes the canonical payload, so the runner's bytes and this response agree", async () => {
    const { json } = await exportDay();
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256")
      .update(JSON.stringify(json.files["days/2026-08-31/day.json"]))
      .digest("hex");
    expect(json.contentHash).toBe(expected);
  });

  it("400s a runId that is not an ET trading day", async () => {
    for (const bad of ["today", "2026-8-31", "20260831"]) {
      const { status, json } = await exportDay(bad);
      expect(status).toBe(400);
      expect(json.error).toMatchObject({ code: "invalid_run" });
    }
    expect(deps.getRunState).not.toHaveBeenCalled();
  });

  it("404s a day with no recorded run", async () => {
    deps.getRunState.mockResolvedValueOnce(null);
    const { status, json } = await exportDay();
    expect(status).toBe(404);
    expect(json.error).toMatchObject({ code: "not_found" });
  });
});

describe("provenance summary", () => {
  const stamp = (field: string, standing: string) => ({
    field,
    source: "finnhub_basic_financials",
    observedAt: "2026-08-31T13:15:00.000Z",
    sourceAsOf: standing === "undated" ? null : "2026-08-31T13:15:00.000Z",
    standing,
  });

  it("summarises how much of the day's evidence could be dated", async () => {
    deps.getDecisionsForDay.mockResolvedValue([
      decision({ evidence: [stamp("price", "clean")], dataGaps: [] }),
      decision({
        evidence: [stamp("price", "clean"), stamp("sector", "undated"), stamp("cap", "undated")],
        dataGaps: [],
      }),
    ]);

    const day = (await exportDay()).json.files["days/2026-08-31/day.json"];
    expect(day.provenance).toEqual({
      decisions: 2,
      verifiable: 1,
      weak: 1,
      unverifiable: 0,
      meanVerifiableShare: (1 + 1 / 3) / 2,
      withheldOn: 0,
    });
  });

  it("reports a decision carrying no stamps as unverifiable", async () => {
    // Pre-stamping records have no evidence array at all; they must not read as
    // clean just because there is nothing to contradict them.
    deps.getDecisionsForDay.mockResolvedValue([decision()]);

    const day = (await exportDay()).json.files["days/2026-08-31/day.json"];
    expect(day.provenance.unverifiable).toBe(1);
    expect(day.provenance.meanVerifiableShare).toBe(0);
  });

  it("counts decisions where a fact was withheld as post-as-of", async () => {
    deps.getDecisionsForDay.mockResolvedValue([
      decision({
        evidence: [stamp("price", "post_asof")],
        dataGaps: [{ field: "price", status: "excluded_post_asof", source: "finnhub_quote" }],
      }),
    ]);

    const day = (await exportDay()).json.files["days/2026-08-31/day.json"];
    expect(day.provenance.withheldOn).toBe(1);
  });

  it("is part of the hashed payload, so it cannot be edited after publication", async () => {
    const first = (await exportDay()).json.contentHash;
    deps.getDecisionsForDay.mockResolvedValue([
      decision({ evidence: [stamp("price", "clean")], dataGaps: [] }),
    ]);
    const second = (await exportDay()).json.contentHash;
    expect(second).not.toBe(first);
  });
});

describe("the payload is deterministic", () => {
  // The whole integrity claim rests on this. The executor refuses to trade
  // anything whose published commit does not hash to the payload it recomputes,
  // so a payload carrying a wall-clock stamp could never match a file written a
  // moment earlier — and the check would have failed open in practice, or been
  // quietly dropped as "flaky".
  it("returns the same contentHash for two exports of the same run", async () => {
    const first = await exportDay();
    const second = await exportDay();
    expect(second.json.contentHash).toBe(first.json.contentHash);
    expect(second.json.files["days/2026-08-31/day.json"]).toEqual(
      first.json.files["days/2026-08-31/day.json"]
    );
  });

  it("takes the latest step completion, whatever order the steps are stored in", () => {
    expect(
      lastStepAt({
        b: { at: "2026-08-31T14:00:00.000Z" },
        a: { at: "2026-08-31T15:00:00.000Z" },
        c: { at: "2026-08-31T13:00:00.000Z" },
      })
    ).toBe("2026-08-31T15:00:00.000Z");
  });

  it("ignores steps with no usable stamp rather than defaulting to now", () => {
    expect(lastStepAt({ a: {}, b: { at: 42 }, c: null })).toBeNull();
  });
});
