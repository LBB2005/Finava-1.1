import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const get = vi.fn();
  return { docs, get };
});

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: () => ({
      doc: (uid: string) => ({
        collection: () => ({
          doc: (id: string) => ({ get: () => deps.get(`${uid}/${id}`) }),
        }),
      }),
    }),
  },
}));

import { getTemplateBlock } from "./templates.server";

function snap(data: Record<string, unknown> | null) {
  return { exists: data !== null, data: () => data ?? undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.get.mockImplementation(async (path: string) =>
    snap((deps.docs.get(path) as Record<string, unknown>) ?? null),
  );
  deps.docs.clear();
});

describe("getTemplateBlock", () => {
  it("renders instructions and formats from the user's own template", async () => {
    deps.docs.set("u1/t1", { instructions: "Cite the filing.", formats: ["brief"] });
    const block = await getTemplateBlock("u1", "t1");
    expect(block).toContain("Their instructions: Cite the filing.");
    expect(block).toContain("Preferred format:");
  });

  it("accepts the legacy singular `format` field", async () => {
    deps.docs.set("u1/t1", { instructions: "Be blunt.", format: "table" });
    const block = await getTemplateBlock("u1", "t1");
    expect(block).toContain("Preferred format:");
  });

  it("reads from the caller's own subcollection, never another user's", async () => {
    deps.docs.set("u1/t1", { instructions: "Mine." });
    expect(await getTemplateBlock("u2", "t1")).toBe("");
    expect(deps.get).toHaveBeenCalledWith("u2/t1");
  });

  it("returns '' without hitting Firestore when userId or templateId is missing", async () => {
    expect(await getTemplateBlock("", "t1")).toBe("");
    expect(await getTemplateBlock("u1", null)).toBe("");
    expect(await getTemplateBlock("u1", undefined)).toBe("");
    expect(deps.get).not.toHaveBeenCalled();
  });

  it("returns '' when the template does not exist", async () => {
    expect(await getTemplateBlock("u1", "missing")).toBe("");
  });

  it("returns '' for a template with nothing to inject", async () => {
    deps.docs.set("u1/t1", {});
    expect(await getTemplateBlock("u1", "t1")).toBe("");
  });

  it("ignores a non-string instructions field", async () => {
    deps.docs.set("u1/t1", { instructions: 42, formats: ["brief"] });
    const block = await getTemplateBlock("u1", "t1");
    expect(block).not.toContain("42");
    expect(block).toContain("Preferred format:");
  });

  it("swallows a Firestore error and returns ''", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.get.mockRejectedValueOnce(new Error("permission denied"));
    expect(await getTemplateBlock("u1", "t1")).toBe("");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
