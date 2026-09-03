import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// Exercises the real withRoute wrapper on POST (auth + zod validate) and the
// hand-rolled requireAuth path on GET.
const deps = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  let nextId = 0;
  const query = {
    orderBy: () => query,
    limit: vi.fn(() => query),
    get: vi.fn(async () => ({
      docs: [...docs.entries()].map(([id, v]) => ({ id, data: () => v })),
    })),
  };
  const col = {
    ...query,
    doc: (id?: string) => {
      const key = id ?? `gen_${++nextId}`;
      return {
        id: key,
        get: async () => ({ exists: docs.has(key), id: key, data: () => docs.get(key) }),
        set: vi.fn(async (v: Record<string, unknown>) => {
          docs.set(key, v);
        }),
      };
    },
  };
  return {
    docs,
    query,
    resetIds: () => {
      nextId = 0;
    },
    requireAuth: vi.fn(),
    collection: vi.fn(() => ({ doc: () => ({ collection: () => col }) })),
  };
});

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/firebase-admin", () => ({
  db: { collection: deps.collection },
  serializeDoc: (id: string, data: Record<string, unknown>) => ({ id, ...data }),
}));
vi.mock("@/lib/usage", () => ({
  checkUsageLimit: vi.fn(async () => null),
  recordUsage: vi.fn(),
  makeRunContext: (userId: string) => ({ userId }),
  usageStore: { run: (_ctx: unknown, fn: () => unknown) => fn() },
}));

import { GET, POST } from "./route";

function post(body: unknown) {
  return new Request("http://test.local/api/playbooks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** A body that satisfies the schema's required fields. */
function validBody(over: Record<string, unknown> = {}) {
  return { title: "My template", steps: ["Summarise the filing"], ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.docs.clear();
  deps.resetIds();
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
});

describe("GET /api/playbooks", () => {
  it("lists the user's templates, newest first and capped at 50", async () => {
    deps.docs.set("p1", { title: "A" });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ id: "p1", title: "A" }]);
    expect(deps.query.limit).toHaveBeenCalledWith(50);
  });

  it("returns an empty list when the user has none", async () => {
    await expect((await GET()).json()).resolves.toEqual([]);
  });

  it("401s an unauthenticated request", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await GET()).status).toBe(401);
  });

  it("500s (without leaking the cause) when Firestore fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.query.get.mockRejectedValueOnce(new Error("index missing"));
    const res = await GET();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to load playbooks" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("POST /api/playbooks", () => {
  it("creates a template and returns it with a 201", async () => {
    const res = await POST(post(validBody()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({
      userId: "user_1",
      title: "My template",
      steps: ["Summarise the filing"],
      formats: [],
    });
    expect(typeof json.createdAt).toBe("string");
    expect(deps.docs.size).toBe(1);
  });

  it("stamps the authenticated user, ignoring any userId in the body", async () => {
    await POST(post(validBody({ userId: "someone_else" })));
    expect([...deps.docs.values()][0]).toMatchObject({ userId: "user_1" });
  });

  it("sanitizes formats through the authoritative allow-list", async () => {
    await POST(post(validBody({ formats: ["brief", "essay", "brief"] })));
    expect([...deps.docs.values()][0]).toMatchObject({ formats: ["brief"] });
  });

  it("folds in the legacy singular `format`", async () => {
    await POST(post(validBody({ format: "table" })));
    expect([...deps.docs.values()][0]).toMatchObject({ formats: ["table"] });
  });

  it("accepts an instructions-only template (no steps)", async () => {
    const res = await POST(post({ title: "T", steps: [], instructions: "Be blunt." }));
    expect(res.status).toBe(201);
  });

  it("accepts a format-only template (no steps, no instructions)", async () => {
    const res = await POST(post({ title: "T", steps: [], formats: ["brief"] }));
    expect(res.status).toBe(201);
  });

  it("400s a template with a name but no payload at all", async () => {
    const res = await POST(post({ title: "T", steps: [] }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "empty_playbook" } });
    expect(deps.docs.size).toBe(0);
  });

  it("400s when every supplied format is unknown and there is no other payload", async () => {
    const res = await POST(post({ title: "T", steps: [], formats: ["essay"] }));
    expect(res.status).toBe(400);
  });

  it("400s a missing or blank title", async () => {
    expect((await POST(post({ steps: ["a"] }))).status).toBe(400);
    expect((await POST(post({ title: "   ", steps: ["a"] }))).status).toBe(400);
  });

  it("truncates an over-long title rather than rejecting it", async () => {
    await POST(post(validBody({ title: "t".repeat(200) })));
    expect(([...deps.docs.values()][0] as { title: string }).title).toHaveLength(80);
  });

  it("drops blank steps, caps the count at 20 and truncates each", async () => {
    await POST(
      post(
        validBody({
          steps: ["  ok  ", "", "   ", 5, "x".repeat(3000), ...Array(25).fill("more")],
        }),
      ),
    );
    const { steps } = [...deps.docs.values()][0] as { steps: string[] };
    expect(steps).toHaveLength(20);
    expect(steps[0]).toBe("ok");
    expect(steps[1]).toHaveLength(2000);
  });

  it("defaults instructions to '' and sourceConversationId to null", async () => {
    await POST(post(validBody()));
    expect([...deps.docs.values()][0]).toMatchObject({
      instructions: "",
      sourceConversationId: null,
    });
  });

  it("keeps a supplied sourceConversationId", async () => {
    await POST(post(validBody({ sourceConversationId: "conv_9" })));
    expect([...deps.docs.values()][0]).toMatchObject({ sourceConversationId: "conv_9" });
  });

  it("401s an unauthenticated request without writing", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(post(validBody()))).status).toBe(401);
    expect(deps.docs.size).toBe(0);
  });

  it("writes into the caller's own subcollection", async () => {
    await POST(post(validBody()));
    expect(deps.collection).toHaveBeenCalledWith("users");
  });
});
