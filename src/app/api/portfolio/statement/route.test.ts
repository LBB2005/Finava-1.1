import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  checkUsageLimit: vi.fn(),
  usageRun: vi.fn((_store: { userId: string }, fn: () => unknown) => fn()),
  usageEnterWith: vi.fn(),
  userRateLimit: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({
  requireAuth: vi.fn(async () => ({ userId: "user_123" })),
}));

vi.mock("@/lib/usage", () => ({
  checkUsageLimit: deps.checkUsageLimit,
  usageStore: {
    run: deps.usageRun,
    enterWith: deps.usageEnterWith,
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  userRateLimit: deps.userRateLimit,
}));

vi.mock("@/lib/llm", () => ({
  generate: deps.generate,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  deps.checkUsageLimit.mockResolvedValue(null);
  deps.userRateLimit.mockReturnValue(null);
});

describe("POST /api/portfolio/statement", () => {
  it("throttles per user and returns a structured error when no file is uploaded", async () => {
    const form = new FormData();
    const res = await POST(
      new Request("http://test.local/api/portfolio/statement", {
        method: "POST",
        body: form,
      })
    );

    expect(deps.userRateLimit).toHaveBeenCalledWith(
      "user_123",
      "portfolio-statement",
      { capacity: 3, refillPerSec: 0.03 }
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "missing_file" },
      message: "No file provided",
    });
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.usageRun).not.toHaveBeenCalled();
    expect(deps.usageEnterWith).not.toHaveBeenCalled();
  });
});
