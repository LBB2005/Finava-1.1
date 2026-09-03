import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const setSpy = vi.fn();
  const updateSpy = vi.fn();
  return {
    docs,
    setSpy,
    updateSpy,
    uids: [] as string[],
    requireAuth: vi.fn(),
    docFor: (uid: string, ticker: string) => {
      const key = `${uid}/${ticker}`;
      return {
        id: ticker,
        get: async () => ({ exists: docs.has(key), id: ticker, data: () => docs.get(key) }),
        set: async (v: Record<string, unknown>) => {
          await setSpy(key, v);
          docs.set(key, v);
        },
        update: async (v: Record<string, unknown>) => {
          await updateSpy(key, v);
          docs.set(key, { ...(docs.get(key) ?? {}), ...v });
        },
      };
    },
  };
});

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: () => ({
      doc: (uid: string) => {
        deps.uids.push(uid);
        return { collection: () => ({ doc: (t: string) => deps.docFor(uid, t) }) };
      },
    }),
  },
}));

import { POST } from "./route";

/** A multipart request carrying `csv` as the uploaded file. */
function upload(csv: string | null, fieldName = "file") {
  const fd = new FormData();
  if (csv !== null) fd.append(fieldName, new File([csv], "holdings.csv", { type: "text/csv" }));
  return new Request("http://test.local/api/portfolio/csv", { method: "POST", body: fd });
}

const VALID_CSV = "Symbol,Quantity,Avg Cost,Name,Sector\nAAPL,10,150,Apple Inc.,Technology\n";

beforeEach(() => {
  vi.clearAllMocks();
  deps.docs.clear();
  deps.uids.length = 0;
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
});

describe("POST /api/portfolio/csv", () => {
  it("imports new holdings and reports the counts", async () => {
    const res = await POST(upload(VALID_CSV));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ imported: 1, failed: 0, total: 1 });
    expect(deps.docs.get("user_1/AAPL")).toMatchObject({
      userId: "user_1",
      ticker: "AAPL",
      shares: 10,
      avgCost: 150,
      companyName: "Apple Inc.",
      sector: "Technology",
    });
  });

  it("keys the document by ticker and stamps created/updated timestamps", async () => {
    await POST(upload(VALID_CSV));
    const doc = deps.docs.get("user_1/AAPL")!;
    expect(typeof doc.createdAt).toBe("string");
    expect(doc.updatedAt).toBe(doc.createdAt);
  });

  it("nulls companyName/sector when the CSV omits those columns", async () => {
    await POST(upload("Symbol,Quantity\nAAPL,10\n"));
    expect(deps.docs.get("user_1/AAPL")).toMatchObject({ companyName: null, sector: null });
  });

  it("updates an existing holding instead of replacing it", async () => {
    deps.docs.set("user_1/AAPL", { ticker: "AAPL", shares: 1, avgCost: 100, createdAt: "old" });
    await POST(upload(VALID_CSV));
    expect(deps.setSpy).not.toHaveBeenCalled();
    expect(deps.docs.get("user_1/AAPL")).toMatchObject({
      shares: 10,
      avgCost: 150,
      createdAt: "old",
    });
  });

  it("omits companyName/sector from an update when the CSV has none", async () => {
    deps.docs.set("user_1/AAPL", { ticker: "AAPL", shares: 1, companyName: "Apple Inc." });
    await POST(upload("Symbol,Quantity\nAAPL,10\n"));
    expect(Object.keys(deps.updateSpy.mock.calls[0][1]).sort()).toEqual([
      "avgCost",
      "shares",
      "updatedAt",
    ]);
    expect(deps.docs.get("user_1/AAPL")!.companyName).toBe("Apple Inc.");
  });

  it("imports several rows at once", async () => {
    const res = await POST(
      upload("Symbol,Quantity,Avg Cost\nAAPL,10,150\nMSFT,5,300\nNVDA,2,900\n"),
    );
    await expect(res.json()).resolves.toEqual({ imported: 3, failed: 0, total: 3 });
  });

  it("counts a per-row write failure without failing the whole import", async () => {
    deps.setSpy.mockRejectedValueOnce(new Error("quota exceeded"));
    const res = await POST(upload("Symbol,Quantity,Avg Cost\nAAPL,10,150\nMSFT,5,300\n"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ imported: 1, failed: 1, total: 2 });
  });

  it("writes into the caller's own subcollection", async () => {
    await POST(upload(VALID_CSV));
    expect(new Set(deps.uids)).toEqual(new Set(["user_1"]));
  });

  it("400s when no file is attached", async () => {
    const res = await POST(upload(null));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No file provided" });
  });

  it("400s when the file is under a different field name", async () => {
    expect((await POST(upload(VALID_CSV, "upload"))).status).toBe(400);
  });

  it("400s a CSV with no importable rows", async () => {
    const res = await POST(upload("Symbol,Quantity\nAAPL,0\n"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No valid holdings found in CSV" });
    expect(deps.setSpy).not.toHaveBeenCalled();
  });

  it("400s and surfaces the parser's message for an unrecognised header", async () => {
    const res = await POST(upload("Foo,Bar\n1,2\n"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Could not find ticker/symbol column in CSV",
    });
  });

  it("400s a body that is not multipart form data", async () => {
    const res = await POST(
      new Request("http://test.local/api/portfolio/csv", { method: "POST", body: "raw text" }),
    );
    expect(res.status).toBe(400);
  });

  it("401s an unauthenticated request without touching the database", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(upload(VALID_CSV))).status).toBe(401);
    expect(deps.setSpy).not.toHaveBeenCalled();
  });
});
