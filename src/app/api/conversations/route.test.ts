import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  conversationsGet: vi.fn(),
  docSet: vi.fn(),
  docGet: vi.fn(),
  autoDocSet: vi.fn(),
  autoDocGet: vi.fn(),
  serializeDoc: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("@/lib/withRoute", () => ({
  withRoute: vi.fn((_opts, handler) => async (
    req = new Request("http://localhost/api/conversations"),
    ctx = {}
  ) => {
    const body = req.method === "POST" ? await req.json() : undefined;
    return handler({ req, userId: "user_123", body }, ctx);
  }),
}));
vi.mock("@/lib/schemas/conversation", () => ({
  CreateConversationSchema: {},
}));
vi.mock("@/lib/firebase-admin", () => ({
  serializeDoc: deps.serializeDoc,
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit: vi.fn(() => ({ get: deps.conversationsGet })) })),
          doc: vi.fn((id?: string) => {
            if (id) return { set: deps.docSet, get: deps.docGet };
            return { set: deps.autoDocSet, get: deps.autoDocGet };
          }),
        })),
      })),
    })),
  },
}));

import { GET, POST } from "./route";

const messageSnap = (messages: Array<{ id: string; data: Record<string, unknown> }>) => ({
  docs: messages.map((m) => ({ id: m.id, data: () => m.data })),
});

const conversationDoc = (
  id: string,
  data: Record<string, unknown>,
  messages: Array<{ id: string; data: Record<string, unknown> }>
) => ({
  id,
  data: () => data,
  ref: {
    collection: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn((n: number) => ({
          get: vi.fn().mockResolvedValue(messageSnap(messages.slice(0, n))),
        })),
      })),
    })),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  deps.conversationsGet.mockResolvedValue({
    docs: [
      conversationDoc("conv_visible", {
        title: "Apple DCF",
        archived: false,
        updatedAt: "2026-06-15T11:00:00Z",
      }, [
        { id: "m1", data: { role: "user", content: "Analyze AAPL" } },
        { id: "m2", data: { role: "assistant", content: "Working..." } },
      ]),
      conversationDoc("conv_archived", {
        title: "Hidden",
        archived: true,
        updatedAt: "2026-06-14T11:00:00Z",
      }, [
        { id: "m3", data: { role: "user", content: "Old chat" } },
      ]),
    ],
  });
  deps.docGet.mockResolvedValue({
    id: "client_conv",
    data: () => ({
      userId: "user_123",
      title: "Client id",
      context: { source: "stock", ticker: "AAPL" },
      createdAt: "2026-06-15T12:00:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    }),
  });
  deps.autoDocGet.mockResolvedValue({
    id: "auto_conv",
    data: () => ({
      userId: "user_123",
      title: null,
      context: null,
      createdAt: "2026-06-15T12:00:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    }),
  });
});

describe("/api/conversations", () => {
  it("lists visible conversations with preview messages and hides archived chats", async () => {
    const res = await GET(new Request("http://localhost/api/conversations"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      {
        id: "conv_visible",
        title: "Apple DCF",
        archived: false,
        updatedAt: "2026-06-15T11:00:00Z",
        messages: [
          { id: "m1", role: "user", content: "Analyze AAPL" },
          { id: "m2", role: "assistant", content: "Working..." },
        ],
      },
    ]);
  });

  it("uses the full-message cap when full text search requests full transcripts", async () => {
    const longMessages = Array.from({ length: 250 }, (_, i) => ({
      id: `m${i}`,
      data: { role: "user", content: `message ${i}` },
    }));
    deps.conversationsGet.mockResolvedValueOnce({
      docs: [conversationDoc("conv_full", { title: "Full", archived: false }, longMessages)],
    });

    const res = await GET(new Request("http://localhost/api/conversations?full=1"));
    const payload = await res.json();

    expect(payload[0].messages).toHaveLength(200);
    expect(payload[0].messages.at(-1)).toEqual({ id: "m199", role: "user", content: "message 199" });
  });

  it("creates conversations with a client-provided optimistic id", async () => {
    const res = await POST(new Request("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        id: "client_conv",
        title: "Client id",
        context: { source: "stock", ticker: "AAPL" },
      }),
    }));

    expect(res.status).toBe(201);
    expect(deps.docSet).toHaveBeenCalledWith({
      userId: "user_123",
      title: "Client id",
      context: { source: "stock", ticker: "AAPL" },
      createdAt: "2026-06-15T12:00:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
    await expect(res.json()).resolves.toMatchObject({
      id: "client_conv",
      title: "Client id",
      messages: [],
    });
  });

  it("falls back to an auto-id and null optional fields", async () => {
    const res = await POST(new Request("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({}),
    }));

    expect(res.status).toBe(201);
    expect(deps.autoDocSet).toHaveBeenCalledWith({
      userId: "user_123",
      title: null,
      context: null,
      createdAt: "2026-06-15T12:00:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
    await expect(res.json()).resolves.toMatchObject({
      id: "auto_conv",
      title: null,
      context: null,
      messages: [],
    });
  });
});
