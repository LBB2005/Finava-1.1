import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/authFetch", () => ({ authFetch: vi.fn() }));

import { authFetch } from "@/lib/authFetch";
import { getEntry, resetMoneyMap, runMoneyMap } from "./moneyMapStore";
import type { MoneyMapEvent, MoneyRelation } from "./moneyMap";

const mockFetch = vi.mocked(authFetch);

function rel(id: string, kind: MoneyRelation["kind"] = "peer"): MoneyRelation {
  return {
    id,
    kind,
    name: id,
    ticker: id.split(":")[1] ?? null,
    weightPct: null,
    intensity: 0.5,
    direction: "none",
    confidence: "verified",
    source: "finnhub",
  };
}

/** A Response whose body streams the given events as SSE `data:` frames. */
function sse(...events: MoneyMapEvent[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });
  return new Response(body, { status: 200 });
}

afterEach(() => mockFetch.mockReset());

describe("moneyMapStore", () => {
  it("returns a stable idle entry for an unknown ticker", () => {
    const a = getEntry("NONE");
    expect(a.status).toBe("idle");
    expect(getEntry("NONE")).toBe(a); // same reference → safe for useSyncExternalStore
  });

  it("assembles self + deduped relations and marks done", async () => {
    mockFetch.mockResolvedValueOnce(
      sse(
        { type: "self", self: { ticker: "NVDA", name: "Nvidia", sector: "Semis", marketCap: 1e12 } },
        { type: "relation", relation: rel("peer:AMD") },
        { type: "relation", relation: { ...rel("peer:AMD"), intensity: 0.9 } }, // same id → replace
        { type: "relation", relation: rel("customer:MSFT", "customer") },
        { type: "done", generatedAt: "2026-06-19" }
      )
    );
    await runMoneyMap("NVDA");
    const e = getEntry("NVDA");
    expect(e.status).toBe("done");
    expect(e.map.self?.ticker).toBe("NVDA");
    expect(e.map.relations).toHaveLength(2);
    expect(e.map.relations.find((r) => r.id === "peer:AMD")?.intensity).toBe(0.9);
    resetMoneyMap("NVDA");
  });

  it("treats a relation-only stream (no terminal event) as done", async () => {
    mockFetch.mockResolvedValueOnce(sse({ type: "relation", relation: rel("peer:AMD") }));
    await runMoneyMap("RELONLY");
    expect(getEntry("RELONLY").status).toBe("done");
    resetMoneyMap("RELONLY");
  });

  it("treats an empty stream as an error", async () => {
    mockFetch.mockResolvedValueOnce(sse());
    await runMoneyMap("EMPTY");
    const e = getEntry("EMPTY");
    expect(e.status).toBe("error");
    expect(e.error).toMatch(/no relationships/i);
    resetMoneyMap("EMPTY");
  });

  it("surfaces a non-OK HTTP response with the server message", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "limit_reached" }), { status: 429 })
    );
    await runMoneyMap("ERR");
    expect(getEntry("ERR").status).toBe("error");
    expect(getEntry("ERR").error).toBe("limit_reached");
    resetMoneyMap("ERR");
  });

  it("propagates an explicit error event from the stream", async () => {
    mockFetch.mockResolvedValueOnce(sse({ type: "error", message: "boom" }));
    await runMoneyMap("BOOM");
    expect(getEntry("BOOM").error).toBe("boom");
    resetMoneyMap("BOOM");
  });

  it("no-ops a second run once a ticker is done", async () => {
    mockFetch.mockResolvedValueOnce(
      sse(
        { type: "self", self: { ticker: "ONCE", name: "Once", sector: null, marketCap: null } },
        { type: "done", generatedAt: "x" }
      )
    );
    await runMoneyMap("ONCE");
    await runMoneyMap("ONCE"); // already done → must not refetch
    expect(mockFetch).toHaveBeenCalledTimes(1);
    resetMoneyMap("ONCE");
  });

  it("resetMoneyMap clears a ticker back to idle", async () => {
    mockFetch.mockResolvedValueOnce(sse({ type: "error", message: "x" }));
    await runMoneyMap("RST");
    expect(getEntry("RST").status).toBe("error");
    resetMoneyMap("RST");
    expect(getEntry("RST").status).toBe("idle");
  });
});
