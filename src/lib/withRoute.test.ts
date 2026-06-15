import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

const auth = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => auth);

import { withRoute } from "@/lib/withRoute";

beforeEach(() => {
  auth.requireAuth.mockResolvedValue({ userId: "user_123" });
});

describe("withRoute", () => {
  it("passes the Next route context through to dynamic route handlers", async () => {
    const handler = withRoute(
      { body: z.object({ name: z.string().min(1) }) },
      async ({ body }, routeCtx: { params: Promise<{ id: string }> }) => {
        const { id } = await routeCtx.params;
        return NextResponse.json({ id, name: body.name });
      }
    );

    const res = await handler(
      new Request("http://test.local/api/items/abc", {
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      }),
      { params: Promise.resolve({ id: "abc" }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "abc", name: "Renamed" });
  });
});
