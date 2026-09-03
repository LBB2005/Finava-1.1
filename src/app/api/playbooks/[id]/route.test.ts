import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const setSpy = vi.fn();
  const deleteSpy = vi.fn();
  const getSpy = vi.fn();
  return {
    docs,
    setSpy,
    deleteSpy,
    getSpy,
    paths: [] as string[],
    requireAuth: vi.fn(),
    docFor: (uid: string, id: string) => {
      const key = `${uid}/${id}`;
      deps.paths.push(key);
      return {
        id,
        get: async () => {
          await getSpy(key);
          return { exists: docs.has(key), id, data: () => docs.get(key) };
        },
        set: async (v: Record<string, unknown>, opts?: { merge?: boolean }) => {
          await setSpy(key, v, opts);
          docs.set(key, opts?.merge ? { ...(docs.get(key) ?? {}), ...v } : v);
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

import { DELETE, PATCH } from "./route";

function patch(body: unknown) {
  return new Request("http://test.local/api/playbooks/p1", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ctx = (id = "p1") => ({ params: Promise.resolve({ id }) });

/** Run PATCH against a seeded template and return the stored doc. */
async function patchAndRead(body: unknown, seed: Record<string, unknown> = { title: "Old" }) {
  deps.docs.set("user_1/p1", seed);
  const res = await PATCH(patch(body), ctx());
  return { res, stored: deps.docs.get("user_1/p1") as Record<string, unknown> };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.docs.clear();
  deps.paths.length = 0;
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
});

describe("PATCH /api/playbooks/[id]", () => {
  it("updates the title and returns the fresh document", async () => {
    const { res, stored } = await patchAndRead({ title: "  New name  " });
    expect(res.status).toBe(200);
    expect(stored.title).toBe("New name");
    await expect(res.json()).resolves.toMatchObject({ id: "p1", title: "New name" });
  });

  it("merges rather than replaces, so untouched fields survive", async () => {
    const { stored } = await patchAndRead({ title: "New" }, { title: "Old", steps: ["keep me"] });
    expect(stored.steps).toEqual(["keep me"]);
    expect(deps.setSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Object), { merge: true });
  });

  it("stamps updatedAt on every write", async () => {
    const { stored } = await patchAndRead({ title: "New" });
    expect(typeof stored.updatedAt).toBe("string");
  });

  it("only touches fields actually present in the body", async () => {
    const { stored } = await patchAndRead({}, { title: "Old", instructions: "keep", steps: ["s"] });
    expect(stored).toMatchObject({ title: "Old", instructions: "keep", steps: ["s"] });
    expect(Object.keys(deps.setSpy.mock.calls[0][1])).toEqual(["updatedAt"]);
  });

  it("truncates an over-long title and instructions", async () => {
    const { stored } = await patchAndRead({
      title: "t".repeat(200),
      instructions: "i".repeat(3000),
    });
    expect(stored.title).toHaveLength(80);
    expect(stored.instructions).toHaveLength(2000);
  });

  it("ignores non-string title and instructions", async () => {
    const { stored } = await patchAndRead({ title: 42, instructions: null }, { title: "Old" });
    expect(stored.title).toBe("Old");
    expect(stored).not.toHaveProperty("instructions");
  });

  it("sanitizes formats through the allow-list", async () => {
    const { stored } = await patchAndRead({ formats: ["brief", "essay", "brief"] });
    expect(stored.formats).toEqual(["brief"]);
  });

  it("accepts the legacy singular `format`", async () => {
    const { stored } = await patchAndRead({ format: "table" });
    expect(stored.formats).toEqual(["table"]);
  });

  it("clears formats when an empty array is sent (Auto)", async () => {
    const { stored } = await patchAndRead({ formats: [] }, { title: "Old", formats: ["brief"] });
    expect(stored.formats).toEqual([]);
  });

  it("leaves formats untouched when neither key is present", async () => {
    const { stored } = await patchAndRead({ title: "New" }, { title: "Old", formats: ["brief"] });
    expect(stored.formats).toEqual(["brief"]);
  });

  it("drops blank steps, caps the count at 20 and truncates each", async () => {
    const { stored } = await patchAndRead({
      steps: ["  ok  ", "", "   ", 7, "x".repeat(3000), ...Array(25).fill("more")],
    });
    const steps = stored.steps as string[];
    expect(steps).toHaveLength(20);
    expect(steps[0]).toBe("ok");
    expect(steps[1]).toHaveLength(2000);
  });

  it("ignores a non-array steps value", async () => {
    const { stored } = await patchAndRead({ steps: "not an array" }, { title: "Old", steps: ["s"] });
    expect(stored.steps).toEqual(["s"]);
  });

  it("404s a template that does not exist", async () => {
    const res = await PATCH(patch({ title: "New" }), ctx("missing"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Template not found" });
    expect(deps.setSpy).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the caller, so another user's id 404s", async () => {
    deps.docs.set("user_2/p1", { title: "Not yours" });
    expect((await PATCH(patch({ title: "New" }), ctx())).status).toBe(404);
    expect(deps.paths).toEqual(["user_1/p1"]);
  });

  it("401s an unauthenticated request before reading anything", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await PATCH(patch({ title: "New" }), ctx())).status).toBe(401);
    expect(deps.getSpy).not.toHaveBeenCalled();
  });

  it("500s on unparseable JSON", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.docs.set("user_1/p1", { title: "Old" });
    const res = await PATCH(patch("{not json"), ctx());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to update template" });
    spy.mockRestore();
  });

  it("500s (without leaking the cause) when the write fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.docs.set("user_1/p1", { title: "Old" });
    deps.setSpy.mockRejectedValueOnce(new Error("quota exceeded"));
    const res = await PATCH(patch({ title: "New" }), ctx());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to update template" });
    spy.mockRestore();
  });
});

describe("DELETE /api/playbooks/[id]", () => {
  it("deletes the template", async () => {
    deps.docs.set("user_1/p1", { title: "Old" });
    const res = await DELETE(new Request("http://test.local/x"), ctx());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(deps.docs.has("user_1/p1")).toBe(false);
  });

  it("is idempotent for an id that does not exist", async () => {
    expect((await DELETE(new Request("http://test.local/x"), ctx("gone"))).status).toBe(200);
  });

  it("scopes the delete to the caller", async () => {
    deps.docs.set("user_2/p1", { title: "Not yours" });
    await DELETE(new Request("http://test.local/x"), ctx());
    expect(deps.deleteSpy).toHaveBeenCalledWith("user_1/p1");
    expect(deps.docs.has("user_2/p1")).toBe(true);
  });

  it("401s an unauthenticated request without deleting", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await DELETE(new Request("http://test.local/x"), ctx())).status).toBe(401);
    expect(deps.deleteSpy).not.toHaveBeenCalled();
  });

  it("500s (without leaking the cause) when the delete fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.deleteSpy.mockRejectedValueOnce(new Error("network"));
    const res = await DELETE(new Request("http://test.local/x"), ctx());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to delete template" });
    spy.mockRestore();
  });
});
