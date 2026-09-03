import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const updateSpy = vi.fn();
  const query = {
    orderBy: vi.fn(() => query),
    limit: vi.fn(() => query),
    get: vi.fn(async () => ({
      docs: [...docs.entries()].map(([id, v]) => ({ id, data: () => v })),
    })),
  };
  return {
    docs,
    query,
    updateSpy,
    uids: [] as string[],
    requireAuth: vi.fn(),
    colFor: (uid: string) => {
      deps.uids.push(uid);
      return {
        ...query,
        doc: (id: string) => ({
          id,
          get: async () => ({ exists: docs.has(id), id, data: () => docs.get(id) }),
          update: async (v: Record<string, unknown>) => {
            await updateSpy(id, v);
            docs.set(id, { ...(docs.get(id) ?? {}), ...v });
          },
        }),
      };
    },
  };
});

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/firebase-admin", () => ({
  db: { collection: () => ({ doc: (uid: string) => ({ collection: () => deps.colFor(uid) }) }) },
  serializeDoc: (id: string, data: Record<string, unknown>) => ({ id, ...data }),
}));

import { GET, PATCH } from "./route";

const patch = (body: unknown) =>
  new Request("http://test.local/api/briefing", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  deps.docs.clear();
  deps.uids.length = 0;
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
});

describe("GET /api/briefing", () => {
  it("returns the ten most recent briefings, newest first", async () => {
    deps.docs.set("b1", { content: "# Weekly", tickers: '["AAPL","MSFT"]', readAt: null });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      { id: "b1", content: "# Weekly", tickers: ["AAPL", "MSFT"], readAt: null },
    ]);
    expect(deps.query.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(deps.query.limit).toHaveBeenCalledWith(10);
  });

  it("parses the JSON-encoded tickers column", async () => {
    deps.docs.set("b1", { tickers: '["NVDA"]' });
    const [b] = await (await GET()).json();
    expect(b.tickers).toEqual(["NVDA"]);
  });

  it("defaults tickers to [] when the field is empty or missing", async () => {
    deps.docs.set("b1", { tickers: "" });
    deps.docs.set("b2", {});
    const list = await (await GET()).json();
    expect(list.map((b: { tickers: string[] }) => b.tickers)).toEqual([[], []]);
  });

  it("returns an empty list when there are none", async () => {
    await expect((await GET()).json()).resolves.toEqual([]);
  });

  it("reads the caller's own subcollection", async () => {
    await GET();
    expect(deps.uids).toEqual(["user_1"]);
  });

  it("401s an unauthenticated request", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await GET()).status).toBe(401);
  });

  it("500s when a stored tickers blob is corrupt", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.docs.set("b1", { tickers: "{not json" });
    const res = await GET();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to load briefings" });
    spy.mockRestore();
  });

  it("500s (without leaking the cause) when Firestore fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.query.get.mockRejectedValueOnce(new Error("index missing"));
    expect((await GET()).status).toBe(500);
    spy.mockRestore();
  });
});

describe("PATCH /api/briefing", () => {
  it("marks a briefing read", async () => {
    deps.docs.set("b1", { content: "x", readAt: null });
    const res = await PATCH(patch({ id: "b1" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, id: "b1" });
    expect(typeof deps.docs.get("b1")!.readAt).toBe("string");
  });

  it("404s an unknown id", async () => {
    const res = await PATCH(patch({ id: "nope" }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Briefing not found" });
    expect(deps.updateSpy).not.toHaveBeenCalled();
  });

  it("scopes the update to the caller's own subcollection", async () => {
    deps.docs.set("b1", { readAt: null });
    await PATCH(patch({ id: "b1" }));
    expect(deps.uids).toEqual(["user_1"]);
  });

  it("401s an unauthenticated request without writing", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await PATCH(patch({ id: "b1" }))).status).toBe(401);
    expect(deps.updateSpy).not.toHaveBeenCalled();
  });

  it("500s on unparseable JSON", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await PATCH(patch("{not json"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to mark briefing read" });
    spy.mockRestore();
  });

  it("500s when the write fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.docs.set("b1", { readAt: null });
    deps.updateSpy.mockRejectedValueOnce(new Error("network"));
    expect((await PATCH(patch({ id: "b1" }))).status).toBe(500);
    spy.mockRestore();
  });
});
