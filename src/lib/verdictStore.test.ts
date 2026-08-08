import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => {
  const doc = { set: vi.fn(), get: vi.fn() };
  const docFn = vi.fn(() => doc);
  const collection = vi.fn(() => ({ doc: docFn }));
  // users → doc(uid) → collection("verdicts") → doc(TICKER)
  const userDoc = vi.fn(() => ({ collection }));
  const users = vi.fn(() => ({ doc: userDoc }));
  return { doc, docFn, collection, userDoc, users };
});

vi.mock("@/lib/firebase-admin", () => ({
  db: { collection: fs.users },
}));

import { saveVerdict, readVerdict } from "./verdictStore";
import type { FinavaVerdict } from "./finava";

const VERDICT: FinavaVerdict = {
  score: 78,
  stance: "Bullish",
  confidence: "High",
  fairValue: 237,
  upsidePct: 19,
  take: "The debate is sizing, not direction.",
  catalysts: ["Backlog"],
  risks: ["Concentration"],
  comparison: { finava: 237, street: 245, dcf: 215 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verdictStore", () => {
  it("saves under users/{uid}/verdicts/{TICKER} with an ISO updatedAt", async () => {
    fs.doc.set.mockResolvedValueOnce(undefined);
    await saveVerdict("user_1", "nvda", VERDICT, []);
    expect(fs.users).toHaveBeenCalledWith("users");
    expect(fs.userDoc).toHaveBeenCalledWith("user_1");
    expect(fs.collection).toHaveBeenCalledWith("verdicts");
    expect(fs.docFn).toHaveBeenCalledWith("NVDA");
    const payload = fs.doc.set.mock.calls[0][0];
    expect(payload.verdict).toEqual(VERDICT);
    expect(payload.signals).toEqual([]);
    expect(new Date(payload.updatedAt).toString()).not.toBe("Invalid Date");
  });

  it("never throws when the write fails", async () => {
    fs.doc.set.mockRejectedValueOnce(new Error("firestore down"));
    await expect(saveVerdict("user_1", "NVDA", VERDICT, [])).resolves.toBeUndefined();
  });

  it("reads a cached run back", async () => {
    fs.doc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ verdict: VERDICT, signals: [], updatedAt: "2026-08-05T12:00:00.000Z" }),
    });
    const out = await readVerdict("user_1", "NVDA");
    expect(out?.verdict.score).toBe(78);
    expect(out?.updatedAt).toBe("2026-08-05T12:00:00.000Z");
  });

  it("returns null for missing or malformed docs", async () => {
    fs.doc.get.mockResolvedValueOnce({ exists: false, data: () => undefined });
    expect(await readVerdict("user_1", "NVDA")).toBeNull();

    fs.doc.get.mockResolvedValueOnce({ exists: true, data: () => ({ junk: true }) });
    expect(await readVerdict("user_1", "NVDA")).toBeNull();
  });
});
