import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  checkUsageLimit: vi.fn(),
  usageRun: vi.fn((_store: { userId: string }, fn: () => unknown) => fn()),
  usageEnterWith: vi.fn(),
  userRateLimit: vi.fn(),
  generate: vi.fn(),
  requireAuth: vi.fn(async () => ({ userId: "user_123" }) as { userId?: string; error?: Response }),
}));

vi.mock("@/lib/requireAuth", () => ({
  requireAuth: deps.requireAuth,
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
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
});

// A minimal File-like value + a Request whose formData() yields it. We avoid
// allocating real multi-MB Files by faking `size`/`type`/`arrayBuffer` directly.
type FakeFile = { size: number; type: string; name?: string; arrayBuffer?: () => Promise<ArrayBuffer> };
function reqWithFile(file: FakeFile | null): Request {
  return {
    formData: async () => ({ get: (k: string) => (k === "file" ? file : null) }),
  } as unknown as Request;
}
const pdf = (over: Partial<FakeFile> = {}): FakeFile => ({
  size: 1024,
  type: "application/pdf",
  name: "statement.pdf",
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  ...over,
});
const lastGenContent = () =>
  (deps.generate.mock.calls.at(-1)![0] as { content: Array<{ type: string; image_url?: { url: string } }> }).content;

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

  it("short-circuits on an auth failure before touching rate-limit or the model", async () => {
    const authErr = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    deps.requireAuth.mockResolvedValueOnce({ error: authErr });
    const res = await POST(reqWithFile(pdf()));
    expect(res.status).toBe(401);
    expect(deps.userRateLimit).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("returns the throttle response when the user is rate-limited", async () => {
    deps.userRateLimit.mockReturnValueOnce(NextResponse.json({ error: "slow down" }, { status: 429 }));
    const res = await POST(reqWithFile(pdf()));
    expect(res.status).toBe(429);
    expect(deps.checkUsageLimit).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("returns the usage-limit response when the user is over quota", async () => {
    deps.checkUsageLimit.mockResolvedValueOnce(NextResponse.json({ error: "quota" }, { status: 402 }));
    const res = await POST(reqWithFile(pdf()));
    expect(res.status).toBe(402);
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("rejects a file over the 10 MB cap with 413", async () => {
    const res = await POST(reqWithFile(pdf({ size: 10 * 1024 * 1024 + 1 })));
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "file_too_large" } });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file type with 415", async () => {
    const res = await POST(reqWithFile(pdf({ type: "text/csv", name: "x.csv" })));
    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "unsupported_file_type" } });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("extracts holdings + buying power from a PDF and sanitizes them", async () => {
    deps.generate.mockResolvedValueOnce(
      JSON.stringify({
        buyingPower: 5000.5,
        holdings: [
          { ticker: "aapl", companyName: "Apple Inc.", shares: 10, avgCost: 150 }, // lowercased ticker
          { ticker: "msft", companyName: null, shares: "5.5", avgCost: "300" }, // string numbers
          { ticker: "ZERO", shares: 0 }, // zero shares → dropped
          { companyName: "No Ticker Co", shares: 3 }, // missing ticker → dropped
          { ticker: "NAN", shares: "not-a-number" }, // NaN shares → dropped
        ],
      }),
    );
    const res = await POST(reqWithFile(pdf()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buyingPower).toBe(5000.5);
    expect(body.holdings).toEqual([
      { ticker: "AAPL", companyName: "Apple Inc.", shares: 10, avgCost: 150 },
      { ticker: "MSFT", companyName: null, shares: 5.5, avgCost: 300 },
    ]);
    // The whole extraction ran inside the usage-metering scope.
    expect(deps.usageRun).toHaveBeenCalledOnce();
    // PDFs are sent as a `file` content part.
    expect(lastGenContent()[0].type).toBe("file");
  });

  it("sends images as an image_url data URL and defaults buyingPower to null", async () => {
    deps.generate.mockResolvedValueOnce(
      JSON.stringify({ holdings: [{ ticker: "NVDA", shares: 2, avgCost: null }] }), // no buyingPower key
    );
    const res = await POST(reqWithFile(pdf({ type: "image/png", name: "shot.png" })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buyingPower).toBeNull();
    expect(body.holdings).toEqual([{ ticker: "NVDA", companyName: null, shares: 2, avgCost: null }]);
    const block = lastGenContent()[0];
    expect(block.type).toBe("image_url");
    expect(block.image_url!.url).toMatch(/^data:image\/png;base64,/);
  });

  it("coerces a non-numeric buyingPower to null", async () => {
    deps.generate.mockResolvedValueOnce(
      JSON.stringify({ buyingPower: "lots", holdings: [{ ticker: "AAPL", shares: 1 }] }),
    );
    const res = await POST(reqWithFile(pdf()));
    expect((await res.json()).buyingPower).toBeNull();
  });

  it("returns 500 when the model yields an empty response", async () => {
    deps.generate.mockResolvedValueOnce("");
    const res = await POST(reqWithFile(pdf()));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "empty_ai_response" } });
  });

  it("returns 422 when no JSON can be parsed from the model output", async () => {
    deps.generate.mockResolvedValueOnce("Sorry, I couldn't read that statement.");
    const res = await POST(reqWithFile(pdf()));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "statement_parse_failed" } });
  });

  it("returns 500 when the model call throws", async () => {
    deps.generate.mockRejectedValueOnce(new Error("gateway down"));
    const res = await POST(reqWithFile(pdf()));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "statement_failed" } });
  });
});
