import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const setSpy = vi.fn();
  const updateSpy = vi.fn();
  return {
    docs,
    setSpy,
    updateSpy,
    paths: [] as string[],
    requireAuth: vi.fn(),
    docFor: (uid: string, id: string) => {
      const key = `${uid}/${id}`;
      deps.paths.push(key);
      return {
        id,
        get: async () => ({ exists: docs.has(key), id, data: () => docs.get(key) }),
        set: async (v: Record<string, unknown>) => {
          await setSpy(key, v);
          docs.set(key, v);
        },
        update: async (v: Record<string, unknown>) => {
          await updateSpy(key, v);
          docs.set(key, { ...(docs.get(key) ?? {}), ...v });
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
}));
vi.mock("@/lib/usage", () => ({
  checkUsageLimit: vi.fn(async () => null),
  recordUsage: vi.fn(),
  makeRunContext: (userId: string) => ({ userId }),
  usageStore: { run: (_ctx: unknown, fn: () => unknown) => fn() },
}));

import { GET, PATCH } from "./route";

const get = () => new Request("http://test.local/api/portfolio/settings");
const patch = (body: unknown) =>
  new Request("http://test.local/api/portfolio/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  deps.docs.clear();
  deps.paths.length = 0;
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
});

describe("GET /api/portfolio/settings", () => {
  it("returns existing settings", async () => {
    deps.docs.set("user_1/default", { cashBalance: 5000, updatedAt: "2026-01-01T00:00:00.000Z" });
    const res = await GET(get());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      cashBalance: 5000,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(deps.setSpy).not.toHaveBeenCalled();
  });

  it("seeds a zero-cash default on first read", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cashBalance).toBe(0);
    expect(typeof json.updatedAt).toBe("string");
    expect(deps.docs.get("user_1/default")).toMatchObject({ cashBalance: 0 });
  });

  it("reads the caller's own settings document", async () => {
    await GET(get());
    expect(deps.paths).toEqual(["user_1/default"]);
  });

  it("401s an unauthenticated request", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await GET(get())).status).toBe(401);
    expect(deps.setSpy).not.toHaveBeenCalled();
  });

  it("500s when the seed write fails", async () => {
    deps.setSpy.mockRejectedValueOnce(new Error("quota exceeded"));
    expect((await GET(get())).status).toBe(500);
  });
});

describe("PATCH /api/portfolio/settings", () => {
  it("updates an existing balance", async () => {
    deps.docs.set("user_1/default", { cashBalance: 0, updatedAt: "old" });
    const res = await PATCH(patch({ cashBalance: 2500 }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ cashBalance: 2500 });
    expect(deps.updateSpy).toHaveBeenCalled();
    expect(deps.setSpy).not.toHaveBeenCalled();
  });

  it("creates the document when it does not exist yet", async () => {
    const res = await PATCH(patch({ cashBalance: 2500 }));
    expect(res.status).toBe(200);
    expect(deps.setSpy).toHaveBeenCalled();
    expect(deps.docs.get("user_1/default")).toMatchObject({ cashBalance: 2500 });
  });

  it("accepts a zero balance", async () => {
    expect((await PATCH(patch({ cashBalance: 0 }))).status).toBe(200);
  });

  it("returns a fresh updatedAt", async () => {
    const json = await (await PATCH(patch({ cashBalance: 1 }))).json();
    expect(typeof json.updatedAt).toBe("string");
    expect(new Date(json.updatedAt).getTime()).not.toBeNaN();
  });

  it("400s a negative balance", async () => {
    expect((await PATCH(patch({ cashBalance: -1 }))).status).toBe(400);
    expect(deps.setSpy).not.toHaveBeenCalled();
    expect(deps.updateSpy).not.toHaveBeenCalled();
  });

  it("400s a non-numeric or missing balance", async () => {
    expect((await PATCH(patch({ cashBalance: "1000" }))).status).toBe(400);
    expect((await PATCH(patch({}))).status).toBe(400);
  });

  it("401s an unauthenticated request without writing", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await PATCH(patch({ cashBalance: 1 }))).status).toBe(401);
    expect(deps.setSpy).not.toHaveBeenCalled();
  });

  it("500s when the write fails", async () => {
    deps.docs.set("user_1/default", { cashBalance: 0 });
    deps.updateSpy.mockRejectedValueOnce(new Error("network"));
    expect((await PATCH(patch({ cashBalance: 1 }))).status).toBe(500);
  });
});
