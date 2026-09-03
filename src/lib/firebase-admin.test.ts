import { beforeEach, describe, expect, it, vi } from "vitest";

/** Stand-in for admin.firestore.Timestamp — `instanceof` is what the module keys
 *  off, so it must be hoisted alongside the vi.mock factory that installs it. */
const { FakeTimestamp } = vi.hoisted(() => ({
  FakeTimestamp: class FakeTimestamp {
    constructor(readonly iso: string) {}
    toDate() {
      return new Date(this.iso);
    }
  },
}));

const deps = vi.hoisted(() => ({
  apps: [] as unknown[],
  initializeApp: vi.fn(),
  cert: vi.fn((c: unknown) => ({ __cert: c })),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
  // Baked in here (not via mockReturnValue below) because the `import` of the
  // module under test is hoisted above any top-level statement in this file.
  getServerEnv: vi.fn(() => ({
    FIREBASE_PROJECT_ID: "proj",
    FIREBASE_CLIENT_EMAIL: "svc@proj.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: "-----BEGIN KEY-----\\nline1\\nline2\\n-----END KEY-----",
  })),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: deps.getServerEnv }));

vi.mock("firebase-admin", () => {
  const firestore = Object.assign(
    () => ({ batch: () => ({ delete: deps.batchDelete, commit: deps.batchCommit }) }),
    { Timestamp: FakeTimestamp },
  );
  return {
    get apps() {
      return deps.apps;
    },
    initializeApp: deps.initializeApp,
    credential: { cert: deps.cert },
    auth: () => ({ __auth: true }),
    firestore,
  };
});

import { deleteRefsInBatches, serializeDoc, tsToISO } from "./firebase-admin";

beforeEach(() => {
  deps.batchDelete.mockClear();
  deps.batchCommit.mockClear();
});

describe("app initialization", () => {
  it("initializes once with credentials from the validated server env", () => {
    expect(deps.initializeApp).toHaveBeenCalledTimes(1);
    expect(deps.cert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj",
        clientEmail: "svc@proj.iam.gserviceaccount.com",
      }),
    );
  });

  it("un-escapes the \\n sequences Vercel stores in the private key", () => {
    const { privateKey } = deps.cert.mock.calls[0][0] as { privateKey: string };
    expect(privateKey).toBe("-----BEGIN KEY-----\nline1\nline2\n-----END KEY-----");
    expect(privateKey).not.toContain("\\n");
  });
});

describe("deleteRefsInBatches", () => {
  const refs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

  it("commits nothing for an empty list", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteRefsInBatches([] as any);
    expect(deps.batchCommit).not.toHaveBeenCalled();
  });

  it("deletes every ref in a single batch when under the chunk size", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteRefsInBatches(refs(10) as any);
    expect(deps.batchDelete).toHaveBeenCalledTimes(10);
    expect(deps.batchCommit).toHaveBeenCalledTimes(1);
  });

  it("chunks past Firestore's 500-op batch cap", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteRefsInBatches(refs(1000) as any);
    expect(deps.batchDelete).toHaveBeenCalledTimes(1000);
    // 1000 refs / 450 per batch = 3 commits.
    expect(deps.batchCommit).toHaveBeenCalledTimes(3);
  });

  it("honours a custom chunk size", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteRefsInBatches(refs(10) as any, 4);
    expect(deps.batchCommit).toHaveBeenCalledTimes(3);
  });
});

describe("tsToISO", () => {
  it("converts a Firestore Timestamp", () => {
    expect(tsToISO(new FakeTimestamp("2026-01-02T03:04:05.000Z") as never)).toBe(
      "2026-01-02T03:04:05.000Z",
    );
  });

  it("converts a plain Date", () => {
    expect(tsToISO(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02T03:04:05.000Z");
  });

  it("returns null for null and undefined", () => {
    expect(tsToISO(null)).toBeNull();
    expect(tsToISO(undefined)).toBeNull();
  });
});

describe("serializeDoc", () => {
  it("puts the id first and passes plain fields through", () => {
    expect(serializeDoc("abc", { ticker: "AAPL", shares: 5, nested: { a: 1 } })).toEqual({
      id: "abc",
      ticker: "AAPL",
      shares: 5,
      nested: { a: 1 },
    });
  });

  it("converts every top-level Timestamp to an ISO string", () => {
    const out = serializeDoc("abc", {
      createdAt: new FakeTimestamp("2026-01-01T00:00:00.000Z"),
      updatedAt: new FakeTimestamp("2026-02-01T00:00:00.000Z"),
      title: "hello",
    });
    expect(out).toEqual({
      id: "abc",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      title: "hello",
    });
  });

  it("leaves null and undefined field values alone", () => {
    expect(serializeDoc("abc", { a: null, b: undefined })).toEqual({
      id: "abc",
      a: null,
      b: undefined,
    });
  });

  it("handles an empty document", () => {
    expect(serializeDoc("abc", {})).toEqual({ id: "abc" });
  });

  it("does not recurse into nested Timestamps (documented shallow behaviour)", () => {
    const inner = new FakeTimestamp("2026-01-01T00:00:00.000Z");
    expect(serializeDoc("abc", { meta: { at: inner } })).toEqual({ id: "abc", meta: { at: inner } });
  });
});
