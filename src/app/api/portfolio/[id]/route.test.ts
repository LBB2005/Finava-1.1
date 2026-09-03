import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();
  return {
    docs,
    updateSpy,
    deleteSpy,
    paths: [] as string[],
    requireAuth: vi.fn(),
    docFor: (uid: string, id: string) => {
      const key = `${uid}/${id}`;
      deps.paths.push(key);
      return {
        id,
        get: async () => ({ exists: docs.has(key), id, data: () => docs.get(key) }),
        update: async (v: Record<string, unknown>) => {
          await updateSpy(key, v);
          docs.set(key, { ...(docs.get(key) ?? {}), ...v });
        },
        delete: async () => {
          await deleteSpy(key);
          docs.delete(key);
        },
      };
    },
  };
});

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: () => ({
      doc: (uid: string) => ({
        collection: () => ({ doc: (id: string) => deps.docFor(uid, id) }),
      }),
    }),
  },
  serializeDoc: (id: string, data: Record<string, unknown>) => ({ id, ...data }),
}));
vi.mock("@/lib/usage", () => ({
  checkUsageLimit: vi.fn(async () => null),
  recordUsage: vi.fn(),
  makeRunContext: (userId: string) => ({ userId }),
  usageStore: { run: (_ctx: unknown, fn: () => unknown) => fn() },
}));

import { DELETE, PATCH } from "./route";

function patch(body: unknown) {
  return new Request("http://test.local/api/portfolio/AAPL", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const ctx = (id = "AAPL") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  deps.docs.clear();
  deps.paths.length = 0;
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
  deps.docs.set("user_1/AAPL", { ticker: "AAPL", shares: 10, avgCost: 150 });
});

describe("PATCH /api/portfolio/[id]", () => {
  it("updates the supplied fields and returns the fresh holding", async () => {
    const res = await PATCH(patch({ shares: 20, avgCost: 160 }), ctx());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: "AAPL", shares: 20, avgCost: 160 });
  });

  it("stamps updatedAt", async () => {
    await PATCH(patch({ shares: 20 }), ctx());
    expect(typeof deps.docs.get("user_1/AAPL")!.updatedAt).toBe("string");
  });

  it("leaves fields absent from the body untouched", async () => {
    await PATCH(patch({ shares: 20 }), ctx());
    expect(deps.docs.get("user_1/AAPL")).toMatchObject({ shares: 20, avgCost: 150 });
    expect(Object.keys(deps.updateSpy.mock.calls[0][1]).sort()).toEqual(["shares", "updatedAt"]);
  });

  it("accepts a null companyName/sector to clear them", async () => {
    await PATCH(patch({ companyName: null, sector: null }), ctx());
    expect(deps.docs.get("user_1/AAPL")).toMatchObject({ companyName: null, sector: null });
  });

  it("accepts avgCost of 0 (a gifted position)", async () => {
    const res = await PATCH(patch({ avgCost: 0 }), ctx());
    expect(res.status).toBe(200);
    expect(deps.docs.get("user_1/AAPL")!.avgCost).toBe(0);
  });

  it("404s a holding the user does not have", async () => {
    const res = await PATCH(patch({ shares: 5 }), ctx("TSLA"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "not_found" } });
    expect(deps.updateSpy).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the caller, so another user's ticker 404s", async () => {
    deps.docs.set("user_2/TSLA", { ticker: "TSLA" });
    expect((await PATCH(patch({ shares: 5 }), ctx("TSLA"))).status).toBe(404);
    expect(deps.paths).toEqual(["user_1/TSLA"]);
  });

  it("400s an empty body", async () => {
    expect((await PATCH(patch({}), ctx())).status).toBe(400);
    expect(deps.updateSpy).not.toHaveBeenCalled();
  });

  it("400s non-positive shares and negative avgCost", async () => {
    expect((await PATCH(patch({ shares: 0 }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ shares: -1 }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ avgCost: -1 }), ctx())).status).toBe(400);
  });

  it("400s a non-numeric shares value", async () => {
    expect((await PATCH(patch({ shares: "10" }), ctx())).status).toBe(400);
  });

  it("401s an unauthenticated request", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await PATCH(patch({ shares: 5 }), ctx())).status).toBe(401);
    expect(deps.updateSpy).not.toHaveBeenCalled();
  });

  it("500s (without leaking the cause) when the write fails", async () => {
    deps.updateSpy.mockRejectedValueOnce(new Error("quota exceeded"));
    const res = await PATCH(patch({ shares: 5 }), ctx());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "internal" } });
  });
});

describe("DELETE /api/portfolio/[id]", () => {
  it("removes the holding", async () => {
    const res = await DELETE(new Request("http://test.local/x", { method: "DELETE" }), ctx());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deps.docs.has("user_1/AAPL")).toBe(false);
  });

  it("404s a holding the user does not have", async () => {
    const res = await DELETE(new Request("http://test.local/x", { method: "DELETE" }), ctx("TSLA"));
    expect(res.status).toBe(404);
    expect(deps.deleteSpy).not.toHaveBeenCalled();
  });

  it("scopes the delete to the caller", async () => {
    deps.docs.set("user_2/TSLA", { ticker: "TSLA" });
    await DELETE(new Request("http://test.local/x", { method: "DELETE" }), ctx("TSLA"));
    expect(deps.docs.has("user_2/TSLA")).toBe(true);
  });

  it("401s an unauthenticated request without deleting", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect(
      (await DELETE(new Request("http://test.local/x", { method: "DELETE" }), ctx())).status,
    ).toBe(401);
    expect(deps.deleteSpy).not.toHaveBeenCalled();
  });

  it("500s when the delete fails", async () => {
    deps.deleteSpy.mockRejectedValueOnce(new Error("network"));
    const res = await DELETE(new Request("http://test.local/x", { method: "DELETE" }), ctx());
    expect(res.status).toBe(500);
  });
});
