import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  convGet: vi.fn(),
  convUpdate: vi.fn(),
  messagesGet: vi.fn(),
  shareSet: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "shares") {
        return {
          doc: vi.fn((id?: string) => ({ id: id ?? "share_new", set: deps.shareSet })),
        };
      }
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({
              get: deps.convGet,
              update: deps.convUpdate,
              collection: vi.fn(() => ({
                orderBy: vi.fn(() => ({ limit: vi.fn(() => ({ get: deps.messagesGet })) })),
              })),
            })),
          })),
        })),
      };
    }),
  },
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.convGet.mockResolvedValue({
    exists: true,
    data: () => ({ title: null }),
  });
  deps.messagesGet.mockResolvedValue({
    docs: [
      { data: () => ({ role: "user", content: "Analyze AAPL", createdAt: "2026-06-15T11:00:00Z" }) },
      { data: () => ({ role: "assistant", content: "DCF ready", createdAt: "2026-06-15T11:01:00Z" }) },
      { data: () => ({ role: "system", content: "", createdAt: "2026-06-15T11:02:00Z" }) },
    ],
  });
  deps.shareSet.mockResolvedValue(undefined);
  deps.convUpdate.mockResolvedValue(undefined);
});

describe("POST /api/conversations/[id]/share", () => {
  it("publishes a stable share snapshot and stores a new share id on first share", async () => {
    const res = await POST(new Request("http://localhost/api/conversations/conv_1/share", {
      method: "POST",
    }), { params: Promise.resolve({ id: "conv_1" }) });

    expect(res.status).toBe(200);
    expect(deps.shareSet).toHaveBeenCalledWith({
      title: "Analyze AAPL",
      messages: [
        { role: "user", content: "Analyze AAPL", createdAt: "2026-06-15T11:00:00Z" },
        { role: "assistant", content: "DCF ready", createdAt: "2026-06-15T11:01:00Z" },
      ],
      createdBy: "user_123",
      sourceConversationId: "conv_1",
      createdAt: "2026-06-15T12:00:00.000Z",
    });
    expect(deps.convUpdate).toHaveBeenCalledWith({ shareId: "share_new" });
    await expect(res.json()).resolves.toEqual({ shareId: "share_new", url: "/share/share_new" });
  });

  it("reuses existing share ids and falls back to a default title", async () => {
    deps.convGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ title: null, shareId: "share_existing" }),
    });
    deps.messagesGet.mockResolvedValueOnce({
      docs: [{ data: () => ({ role: "assistant", content: "Only assistant", createdAt: undefined }) }],
    });

    const res = await POST(new Request("http://localhost/api/conversations/conv_1/share", {
      method: "POST",
    }), { params: Promise.resolve({ id: "conv_1" }) });

    expect(res.status).toBe(200);
    expect(deps.shareSet).toHaveBeenCalledWith(expect.objectContaining({
      title: "Finava conversation",
      messages: [{ role: "assistant", content: "Only assistant", createdAt: null }],
    }));
    expect(deps.convUpdate).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ shareId: "share_existing", url: "/share/share_existing" });
  });

  it("returns auth, missing conversation, empty transcript, and unexpected failure responses", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(new Request("http://localhost/api/conversations/conv_1/share", {
      method: "POST",
    }), { params: Promise.resolve({ id: "conv_1" }) })).status).toBe(401);

    deps.convGet.mockResolvedValueOnce({ exists: false });
    expect((await POST(new Request("http://localhost/api/conversations/missing/share", {
      method: "POST",
    }), { params: Promise.resolve({ id: "missing" }) })).status).toBe(404);

    deps.messagesGet.mockResolvedValueOnce({ docs: [{ data: () => ({ role: "user", content: "" }) }] });
    expect((await POST(new Request("http://localhost/api/conversations/empty/share", {
      method: "POST",
    }), { params: Promise.resolve({ id: "empty" }) })).status).toBe(400);

    deps.messagesGet.mockRejectedValueOnce(new Error("firestore down"));
    expect((await POST(new Request("http://localhost/api/conversations/conv_1/share", {
      method: "POST",
    }), { params: Promise.resolve({ id: "conv_1" }) })).status).toBe(500);
  });
});
