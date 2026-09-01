import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

// A small in-memory Firestore: enough to exercise create-vs-set semantics and
// the transaction, which is where the append-only guarantee actually lives.
const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("@/lib/firebase-admin", () => {
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
  });
  const db = {
    collection: (col: string) => ({ doc: (id: string) => ref(`${col}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const creates: [string, Record<string, unknown>][] = [];
      const sets: [string, Record<string, unknown>][] = [];
      const tx = {
        get: async (r: { path: string }) => ({
          exists: store.has(r.path),
          data: () => store.get(r.path),
        }),
        create: (r: { path: string }, data: Record<string, unknown>) => {
          creates.push([r.path, data]);
        },
        set: (r: { path: string }, data: Record<string, unknown>) => {
          sets.push([r.path, data]);
        },
      };
      const result = await fn(tx);
      for (const [path] of creates) {
        if (store.has(path)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
      }
      for (const [path, data] of creates) store.set(path, data);
      for (const [path, data] of sets) store.set(path, { ...(store.get(path) ?? {}), ...data });
      return result;
    },
  };
  return { db };
});

import {
  appendDecision,
  appendEvent,
  appendSnapshot,
  getChainHeads,
  canonicalJson,
  hashEntry,
  verifyChain,
  decisionId,
  LedgerConflictError,
  CHAIN_GENESIS,
} from "./ledger";
import type { DecisionRecord } from "@/lib/schemas/live/decision";

function decision(over: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    schemaVersion: 2,
    decisionId: decisionId("2026-09-08", "NVDA", "entry"),
    runId: "2026-09-08",
    tradingDay: "2026-09-08",
    asOf: "2026-09-08T13:15:00.000Z",
    evidence: [],
    ticker: "NVDA",
    kind: "entry",
    blindReunderwrite: false,
    priorDecisionId: null,
    thesis: "Accelerator demand is underpriced.",
    stated: { probability: 0.65, horizonDays: 63, expectedReturnPct: 14 },
    invalidation: [
      {
        id: "c1",
        metric: "price_vs_entry_pct",
        operator: "lt",
        threshold: -18,
        unit: "pct",
        source: "alpaca_snapshot",
        consecutive: 1,
        statement: "Price falls 18% from entry.",
        horizonDays: 63,
      },
    ],
    votes: [
      { agent: "analyst", role: "bull", stance: "buy", confidence: 0.8, summary: "…", citations: [] },
    ],
    dissent: "Risk flags concentration.",
    targetWeightPct: 6,
    mandateChecks: [{ rule: "min_weight", passed: true, detail: "6% vs 3% floor" }],
    dataGaps: [],
    agentVersion: "2026-09-08.a",
    promptHash: "a".repeat(64),
    transcriptRef: "liveTranscripts/2026-09-08-NVDA-entry",
    createdAt: "2026-09-08T11:31:04.000Z",
    ...over,
  };
}

beforeEach(() => {
  store.clear();
});

describe("canonicalJson", () => {
  it("orders keys so identical data hashes identically", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("preserves array order, which is meaningful for votes", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("sorts nested keys too", () => {
    expect(canonicalJson({ x: { d: 1, c: 2 } })).toBe('{"x":{"c":2,"d":1}}');
  });

  it("drops undefined rather than emitting it", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("append", () => {
  it("writes through create() and chains from genesis on the first entry", async () => {
    const entry = await appendDecision(decision());
    expect(entry.prevHash).toBe(CHAIN_GENESIS);
    expect(entry.hash).toBe(hashEntry(decision(), CHAIN_GENESIS));
    expect(store.get(`liveDecisions/${entry.docId}`)).toMatchObject({
      ticker: "NVDA",
      prevHash: CHAIN_GENESIS,
      hash: entry.hash,
    });
  });

  it("links each entry to the previous one and advances the head", async () => {
    const first = await appendDecision(decision());
    const second = await appendDecision(
      decision({ decisionId: decisionId("2026-09-09", "MSFT", "entry"), ticker: "MSFT" })
    );
    expect(second.prevHash).toBe(first.hash);

    const heads = await getChainHeads();
    expect(heads.heads.liveDecisions).toBe(second.hash);
  });

  it("chains each collection independently", async () => {
    const d = await appendDecision(decision());
    const e = await appendEvent({
      eventId: "evt-1",
      tradingDay: "2026-09-08",
      kind: "run_started",
      message: "shadow run",
      createdAt: "2026-09-08T11:00:00.000Z",
    });
    // A fresh collection starts at genesis regardless of other collections.
    expect(e.prevHash).toBe(CHAIN_GENESIS);
    expect(e.hash).not.toBe(d.hash);

    const heads = await getChainHeads();
    expect(heads.heads.liveDecisions).toBe(d.hash);
    expect(heads.heads.liveEvents).toBe(e.hash);
  });

  it("refuses a replayed doc id instead of overwriting it", async () => {
    await appendDecision(decision());
    await expect(appendDecision(decision({ thesis: "rewritten history" }))).rejects.toBeInstanceOf(
      LedgerConflictError
    );
    // The original survives — this is the property the whole record rests on.
    expect(store.get("liveDecisions/2026-09-08-NVDA-entry")).toMatchObject({
      thesis: "Accelerator demand is underpriced.",
    });
  });

  it("keys a snapshot by trading day so a day can only be written once", async () => {
    const snap = {
      tradingDay: "2026-09-08",
      runId: "2026-09-08",
      equity: 10_000,
      cash: 2_000,
      cashPct: 20,
      inceptionEquity: 10_000,
      cumulativeReturnPct: 0,
      benchmarkCumulativeReturnPct: null,
      highWaterMark: 10_000,
      drawdownPct: 0,
      entriesFrozen: false,
      freezeDaysRemaining: 0,
      positions: [],
      grossExposurePct: 80,
      shortExposurePct: 0,
      agentVersion: "2026-09-08.a",
      executionMode: "shadow" as const,
      createdAt: "2026-09-08T21:00:00.000Z",
    };
    await appendSnapshot(snap);
    await expect(appendSnapshot(snap)).rejects.toBeInstanceOf(LedgerConflictError);
  });

  it("names the collection and doc id in the conflict, so a replay is diagnosable", async () => {
    await appendDecision(decision());
    await expect(appendDecision(decision())).rejects.toMatchObject({
      collection: "liveDecisions",
      docId: "2026-09-08-NVDA-entry",
    });
  });
});

describe("verifyChain", () => {
  type ChainEntry = { prevHash: string; hash: string; [k: string]: unknown };

  function chain(payloads: Record<string, unknown>[]): ChainEntry[] {
    let prev = CHAIN_GENESIS;
    return payloads.map((p) => {
      const hash = hashEntry(p, prev);
      const entry = { ...p, prevHash: prev, hash };
      prev = hash;
      return entry;
    });
  }

  it("accepts an intact chain and reports its head", () => {
    const entries = chain([{ a: 1 }, { a: 2 }, { a: 3 }]);
    const v = verifyChain(entries);
    expect(v).toMatchObject({ valid: true, length: 3, brokenAt: null });
    expect(v.head).toBe(entries[2].hash);
  });

  it("accepts an empty chain at genesis", () => {
    expect(verifyChain([])).toMatchObject({ valid: true, length: 0, head: CHAIN_GENESIS });
  });

  it("catches an edited payload — the tamper case", () => {
    const entries = chain([{ a: 1 }, { a: 2 }, { a: 3 }]);
    entries[1] = { ...entries[1], a: 99 };
    expect(verifyChain(entries)).toMatchObject({ valid: false, brokenAt: 1 });
  });

  it("catches a deleted entry, because the link no longer matches", () => {
    const entries = chain([{ a: 1 }, { a: 2 }, { a: 3 }]);
    entries.splice(1, 1);
    expect(verifyChain(entries)).toMatchObject({ valid: false, brokenAt: 1 });
  });

  it("catches a reordered chain", () => {
    const entries = chain([{ a: 1 }, { a: 2 }]);
    expect(verifyChain([entries[1], entries[0]])).toMatchObject({ valid: false, brokenAt: 0 });
  });
});
