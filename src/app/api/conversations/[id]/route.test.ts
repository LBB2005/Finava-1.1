import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  convGet: vi.fn(),
  convUpdate: vi.fn(),
  messagesOrderGet: vi.fn(),
  messagesGet: vi.fn(),
  deleteRefsInBatches: vi.fn(),
  serializeDoc: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("@/lib/withRoute", () => ({
  withRoute: vi.fn((_opts, handler) => async (
    req = new Request("http://localhost/api/conversations/conv_1"),
    ctx = { params: Promise.resolve({ id: "conv_1" }) }
  ) => {
    const body = req.method === "PATCH" ? await req.json() : undefined;
    return handler({ req, userId: "user_123", body }, ctx);
  }),
}));
vi.mock("@/lib/schemas/conversation", () => ({
  UpdateConversationSchema: {},
}));
vi.mock("@/lib/firebase-admin", () => ({
  serializeDoc: deps.serializeDoc,
  deleteRefsInBatches: deps.deleteRefsInBatches,
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            get: deps.convGet,
            update: deps.convUpdate,
            collection: vi.fn(() => ({
              orderBy: vi.fn(() => ({ limit: vi.fn(() => ({ get: deps.messagesOrderGet })) })),
              get: deps.messagesGet,
            })),
            path: "users/user_123/conversations/conv_1",
          })),
        })),
      })),
    })),
  },
}));

import { DELETE, GET, PATCH } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  deps.convGet.mockResolvedValue({
    exists: true,
    id: "conv_1",
    data: () => ({ title: "Apple", archived: false, updatedAt: "2026-06-15T11:00:00Z" }),
  });
  deps.messagesOrderGet.mockResolvedValue({
    docs: [
      { id: "m1", data: () => ({ role: "user", content: "AAPL" }) },
      { id: "m2", data: () => ({ role: "assistant", content: "DCF ready" }) },
    ],
  });
  deps.messagesGet.mockResolvedValue({
    docs: [{ ref: { path: "users/user_123/conversations/conv_1/messages/m1" } }],
  });
  deps.convUpdate.mockResolvedValue(undefined);
  deps.deleteRefsInBatches.mockResolvedValue(undefined);
});

describe("/api/conversations/[id]", () => {
  it("loads a conversation transcript with a hard message cap", async () => {
    const res = await GET(new Request("http://localhost/api/conversations/conv_1"), {
      params: Promise.resolve({ id: "conv_1" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: "conv_1",
      title: "Apple",
      archived: false,
      updatedAt: "2026-06-15T11:00:00Z",
      messages: [
        { id: "m1", role: "user", content: "AAPL" },
        { id: "m2", role: "assistant", content: "DCF ready" },
      ],
    });
  });

  it("returns the shared not_found shape when a conversation is missing", async () => {
    deps.convGet.mockResolvedValueOnce({ exists: false });

    const res = await GET(new Request("http://localhost/api/conversations/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: { code: "not_found", message: "Not found" },
      message: "Not found",
    });
  });

  it("patches only supplied title/archive fields and returns the updated document", async () => {
    deps.convGet.mockResolvedValueOnce({
      id: "conv_1",
      data: () => ({ title: "Renamed", archived: true, updatedAt: "2026-06-15T12:00:00.000Z" }),
    });

    const res = await PATCH(new Request("http://localhost/api/conversations/conv_1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed", archived: true }),
    }), { params: Promise.resolve({ id: "conv_1" }) });

    expect(res.status).toBe(200);
    expect(deps.convUpdate).toHaveBeenCalledWith({
      updatedAt: "2026-06-15T12:00:00.000Z",
      title: "Renamed",
      archived: true,
    });
    await expect(res.json()).resolves.toEqual({
      id: "conv_1",
      title: "Renamed",
      archived: true,
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
  });

  it("deletes messages and the conversation document in one batch helper call", async () => {
    const res = await DELETE(new Request("http://localhost/api/conversations/conv_1", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "conv_1" }) });

    expect(res.status).toBe(200);
    expect(deps.deleteRefsInBatches).toHaveBeenCalledWith([
      { path: "users/user_123/conversations/conv_1/messages/m1" },
      expect.objectContaining({ path: "users/user_123/conversations/conv_1" }),
    ]);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
