import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("@/lib/firebase-admin", () => {
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
  });
  return {
    db: {
      collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const writes: [string, Record<string, unknown>][] = [];
        const tx = {
          get: async (r: { path: string }) => ({ data: () => store.get(r.path) }),
          set: (r: { path: string }, d: Record<string, unknown>) => writes.push([r.path, d]),
        };
        const out = await fn(tx);
        for (const [p, d] of writes) store.set(p, { ...(store.get(p) ?? {}), ...d });
        return out;
      },
    },
  };
});

import {
  budgetStatus,
  resolveDailyCap,
  chargeStep,
  readBudget,
  BudgetExceededError,
  DEFAULT_DAILY_CREDIT_CAP,
} from "./budget";

beforeEach(() => store.clear());

describe("resolveDailyCap", () => {
  it.each([
    ["a plain number", "1500", 1500],
    ["an unset value", undefined, DEFAULT_DAILY_CREDIT_CAP],
    ["nonsense", "abc", DEFAULT_DAILY_CREDIT_CAP],
    ["zero", "0", DEFAULT_DAILY_CREDIT_CAP],
    ["a negative", "-5", DEFAULT_DAILY_CREDIT_CAP],
  ])("resolves %s", (_l, raw, expected) => {
    expect(resolveDailyCap(raw)).toBe(expected);
  });
});

describe("budgetStatus", () => {
  it("reports remaining and percentage below the cap", () => {
    expect(budgetStatus(1000, 250)).toMatchObject({
      remaining: 750,
      pctUsed: 25,
      exhausted: false,
      warning: false,
    });
  });

  it("raises a warning at 80% without stopping the run", () => {
    const s = budgetStatus(1000, 800);
    expect(s.warning).toBe(true);
    expect(s.exhausted).toBe(false);
  });

  it("is exhausted exactly at the cap, not only past it", () => {
    expect(budgetStatus(1000, 1000).exhausted).toBe(true);
  });

  it("never reports negative remaining on an overshoot", () => {
    expect(budgetStatus(1000, 1400).remaining).toBe(0);
  });
});

describe("chargeStep", () => {
  it("accumulates across separate invocations, which each have their own context", async () => {
    await chargeStep("2026-09-08", "scout", 100, 1000);
    await chargeStep("2026-09-08", "wave-0", 150, 1000);
    const s = await chargeStep("2026-09-08", "debate", 200, 1000);
    expect(s.spent).toBe(450);
    expect(s.remaining).toBe(550);
  });

  it("records the spend before refusing, so the day's cost is not under-reported", async () => {
    await chargeStep("2026-09-08", "scout", 900, 1000);
    await expect(chargeStep("2026-09-08", "debate", 200, 1000)).rejects.toBeInstanceOf(
      BudgetExceededError
    );
    // The overshooting step is still counted — that money was genuinely spent.
    expect(await readBudget("2026-09-08", 1000)).toMatchObject({ spent: 1100, exhausted: true });
  });

  it("names the run and step in the error, so an abort is diagnosable", async () => {
    await expect(chargeStep("2026-09-08", "wave-2", 5000, 1000)).rejects.toMatchObject({
      runId: "2026-09-08",
      step: "wave-2",
      cap: 1000,
    });
  });

  it("keeps per-step detail for the published cost breakdown", async () => {
    await chargeStep("2026-09-08", "scout", 100, 1000);
    expect(store.get("liveRuns/2026-09-08")).toMatchObject({
      creditsSpent: 100,
      stepCredits: { scout: { credits: 100 } },
    });
  });

  it("ignores a negative credit reading rather than refunding the day", async () => {
    await chargeStep("2026-09-08", "scout", 100, 1000);
    const s = await chargeStep("2026-09-08", "odd", -50, 1000);
    expect(s.spent).toBe(100);
  });

  it("keeps separate days separate", async () => {
    await chargeStep("2026-09-08", "scout", 900, 1000);
    const next = await chargeStep("2026-09-09", "scout", 100, 1000);
    expect(next.spent).toBe(100);
  });
});

describe("readBudget", () => {
  it("reports a fresh day as unspent without creating it", async () => {
    expect(await readBudget("2026-09-10", 1000)).toMatchObject({ spent: 0, exhausted: false });
    expect(store.has("liveRuns/2026-09-10")).toBe(false);
  });
});
