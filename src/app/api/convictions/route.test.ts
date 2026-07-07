import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  orderByGet: vi.fn(),
  addConviction: vi.fn(),
  serializeDoc: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("@/lib/withRoute", () => ({
  withRoute: vi.fn(
    (_opts: unknown, handler: (ctx: { req: Request; userId: string; body: unknown }) => unknown) =>
      async (req: Request) => {
        let body: unknown;
        try {
          body = req.method === "POST" ? await req.json() : undefined;
        } catch {
          body = undefined;
        }
        return handler({ req, userId: "user_123", body });
      }
  ),
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
            return {
              orderBy: vi.fn(() => ({ get: deps.orderByGet })),
              add: deps.addConviction,
            };
          }),
        })),
      };
    }),
  },
}));

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  deps.orderByGet.mockResolvedValue({
    docs: [{ id: "c1", data: () => ({ ticker: "CELH", thesisTrait: "intl expansion", status: "forming" }) }],
  });
  deps.addConviction.mockResolvedValue({
    get: vi.fn(async () => ({
      id: "new_c",
      data: () => ({ ticker: "NVDA", thesisTrait: "ai capex", status: "forming", outcomePct: null }),
    })),
  });
});

describe("GET /api/convictions", () => {
  it("returns the user's convictions newest first", async () => {
    const res = await GET(new Request("http://test.local/api/convictions"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      { id: "c1", ticker: "CELH", thesisTrait: "intl expansion", status: "forming" },
    ]);
  });
});

describe("POST /api/convictions", () => {
  it("creates a conviction with server fields and returns it", async () => {
    const body = {
      ticker: "NVDA", direction: "bull", thesisTrait: "ai capex",
      factorTags: ["growth"], reasoning: "r", falsifier: "f",
      confidence: 0.7, status: "forming", source: "manual",
    };
    const res = await POST(
      new Request("http://test.local/api/convictions", { method: "POST", body: JSON.stringify(body) })
    );

    expect(res.status).toBe(201);
    expect(deps.addConviction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_123",
        ticker: "NVDA",
        direction: "bull",
        thesisTrait: "ai capex",
        outcomePct: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    );
    await expect(res.json()).resolves.toMatchObject({ id: "new_c", ticker: "NVDA" });
  });
});
