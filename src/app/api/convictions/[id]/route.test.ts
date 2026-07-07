import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  serializeDoc: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("@/lib/withRoute", () => ({
  withRoute: vi.fn(
    (_opts: unknown, handler: (ctx: { req: Request; userId: string; body: unknown }, routeCtx: unknown) => unknown) =>
      async (req: Request, routeCtx: unknown) => {
        let body: unknown;
        try {
          body = req.method === "PATCH" ? await req.json() : undefined;
        } catch {
          body = undefined;
        }
        return handler({ req, userId: "user_123", body }, routeCtx);
      }
  ),
}));

vi.mock("@/lib/apiError", () => ({
  apiError: (code: string, message: string, status: number) =>
    NextResponse.json({ error: code, message }, { status }),
}));

vi.mock("@/lib/firebase-admin", () => ({
  serializeDoc: deps.serializeDoc,
  db: {
    collection: vi.fn((name: string) => {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return {
        doc: vi.fn(() => ({
          collection: vi.fn((sub: string) => {
            if (sub !== "convictions") throw new Error(`unexpected subcollection ${sub}`);
            return { doc: vi.fn(() => ({ get: deps.get, update: deps.update, delete: deps.del })) };
          }),
        })),
      };
    }),
  },
}));

import { GET, PATCH, DELETE } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  deps.update.mockResolvedValue(undefined);
  deps.del.mockResolvedValue(undefined);
});

describe("GET /api/convictions/[id]", () => {
  it("returns the conviction when it exists", async () => {
    deps.get.mockResolvedValue({ exists: true, id: "c1", data: () => ({ ticker: "CELH" }) });
    const res = await GET(new Request("http://test.local/api/convictions/c1"), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: "c1", ticker: "CELH" });
  });

  it("404s when missing", async () => {
    deps.get.mockResolvedValue({ exists: false });
    const res = await GET(new Request("http://test.local/api/convictions/c1"), ctx);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/convictions/[id]", () => {
  it("updates allowed fields and returns the doc", async () => {
    deps.get
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ exists: true, id: "c1", data: () => ({ ticker: "CELH", status: "playing_out" }) });
    const res = await PATCH(
      new Request("http://test.local/api/convictions/c1", { method: "PATCH", body: JSON.stringify({ status: "playing_out", outcomePct: 11 }) }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(deps.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "playing_out", outcomePct: 11, updatedAt: expect.any(String) })
    );
  });

  it("404s when the conviction is missing", async () => {
    deps.get.mockResolvedValue({ exists: false });
    const res = await PATCH(
      new Request("http://test.local/api/convictions/c1", { method: "PATCH", body: JSON.stringify({ status: "closed" }) }),
      ctx
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/convictions/[id]", () => {
  it("deletes an existing conviction", async () => {
    deps.get.mockResolvedValue({ exists: true });
    const res = await DELETE(new Request("http://test.local/api/convictions/c1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(deps.del).toHaveBeenCalledTimes(1);
  });

  it("404s when the conviction is missing", async () => {
    deps.get.mockResolvedValue({ exists: false });
    const res = await DELETE(new Request("http://test.local/api/convictions/c1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });
});
