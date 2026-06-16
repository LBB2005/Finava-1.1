import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  checkUsageLimit: vi.fn(),
  usageRun: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
  recordUsage: vi.fn(),
  anthropicCreate: vi.fn(),
  convGet: vi.fn(),
  messagesGet: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/anthropic", () => ({
  MODEL: "claude-test",
  anthropic: { messages: { create: deps.anthropicCreate } },
}));
vi.mock("@/lib/usage", () => ({
  checkUsageLimit: deps.checkUsageLimit,
  recordUsage: deps.recordUsage,
  usageStore: { run: deps.usageRun },
}));
vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            get: deps.convGet,
            collection: vi.fn(() => ({
              orderBy: vi.fn(() => ({ limit: vi.fn(() => ({ get: deps.messagesGet })) })),
            })),
          })),
        })),
      })),
    })),
  },
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.checkUsageLimit.mockResolvedValue(null);
  deps.convGet.mockResolvedValue({ exists: true });
  deps.messagesGet.mockResolvedValue({
    docs: [
      { data: () => ({ role: "user", content: "Analyze AAPL" }) },
      { data: () => ({ role: "assistant", content: "DCF says modest upside" }) },
      { data: () => ({ role: "assistant", content: "" }) },
    ],
  });
  deps.anthropicCreate.mockResolvedValue({
    usage: { input_tokens: 120, output_tokens: 45 },
    content: [
      { type: "text", text: "## Key Insights\n- AAPL has modest upside." },
      { type: "tool_use", name: "ignored" },
    ],
  });
  deps.recordUsage.mockResolvedValue(undefined);
});

describe("POST /api/conversations/[id]/digest", () => {
  it("checks auth and usage before generating a digest and recording spend", async () => {
    const res = await POST(new Request("http://localhost/api/conversations/conv_1/digest", {
      method: "POST",
    }), { params: Promise.resolve({ id: "conv_1" }) });

    expect(res.status).toBe(200);
    expect(deps.checkUsageLimit).toHaveBeenCalledWith("user_123");
    expect(deps.usageRun).toHaveBeenCalledWith({ userId: "user_123" }, expect.any(Function));
    expect(deps.anthropicCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: "claude-test",
      max_tokens: 1200,
      messages: [{ role: "user", content: "User: Analyze AAPL\n\nFinava: DCF says modest upside" }],
    }));
    expect(deps.recordUsage).toHaveBeenCalledWith({
      agent: "digest",
      model: "claude-test",
      inputTokens: 120,
      outputTokens: 45,
    });
    await expect(res.json()).resolves.toEqual({
      digest: "## Key Insights\n- AAPL has modest upside.",
    });
  });

  it("short-circuits auth and usage-limit failures before reading the transcript", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(new Request("http://localhost/api/conversations/conv_1/digest", {
      method: "POST",
    }), { params: Promise.resolve({ id: "conv_1" }) })).status).toBe(401);

    deps.checkUsageLimit.mockResolvedValueOnce(NextResponse.json({ error: "Limit" }, { status: 402 }));
    expect((await POST(new Request("http://localhost/api/conversations/conv_1/digest", {
      method: "POST",
    }), { params: Promise.resolve({ id: "conv_1" }) })).status).toBe(402);
  });

  it("handles missing and empty conversations plus unexpected provider failures", async () => {
    deps.convGet.mockResolvedValueOnce({ exists: false });
    expect((await POST(new Request("http://localhost/api/conversations/missing/digest", {
      method: "POST",
    }), { params: Promise.resolve({ id: "missing" }) })).status).toBe(404);

    deps.messagesGet.mockResolvedValueOnce({ docs: [{ data: () => ({ role: "user", content: "" }) }] });
    expect((await POST(new Request("http://localhost/api/conversations/empty/digest", {
      method: "POST",
    }), { params: Promise.resolve({ id: "empty" }) })).status).toBe(400);

    deps.anthropicCreate.mockRejectedValueOnce(new Error("provider down"));
    expect((await POST(new Request("http://localhost/api/conversations/conv_1/digest", {
      method: "POST",
    }), { params: Promise.resolve({ id: "conv_1" }) })).status).toBe(500);
  });
});
