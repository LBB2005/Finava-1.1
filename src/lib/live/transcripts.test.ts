import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory Firestore with just enough shape for batched writes and
// subcollection reads — the two things this module depends on.
const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("@/lib/firebase-admin", () => {
  interface Ref {
    path: string;
    get: () => Promise<unknown>;
    collection: (c: string) => unknown;
  }
  const docRef = (path: string): Ref => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    collection: (c: string) => collectionRef(`${path}/${c}`),
  });
  const collectionRef = (path: string) => ({
    path,
    doc: (id: string) => docRef(`${path}/${id}`),
    get: async () => {
      const prefix = `${path}/`;
      const docs = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
        .map(([k, v]) => ({
          id: k.slice(prefix.length),
          ref: { path: k },
          get: (field: string) => v[field],
        }));
      return { docs, empty: docs.length === 0 };
    },
  });
  const db = {
    collection: (c: string) => collectionRef(c),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: { path: string }, data: Record<string, unknown>) =>
          ops.push(() => store.set(r.path, data)),
        delete: (r: { path: string }) => ops.push(() => store.delete(r.path)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { db };
});

import { chunkText, readTranscript, transcriptId, transcriptRef, writeTranscript } from "./transcripts";

beforeEach(() => store.clear());

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("keeps text that fits in one chunk whole", () => {
    expect(chunkText("abcdef", 10)).toEqual(["abcdef"]);
  });

  it("splits on the boundary without dropping or duplicating characters", () => {
    const chunks = chunkText("abcdefg", 3);
    expect(chunks).toEqual(["abc", "def", "g"]);
    expect(chunks.join("")).toBe("abcdefg");
  });

  it("refuses a non-positive chunk size rather than looping forever", () => {
    expect(() => chunkText("abc", 0)).toThrow(RangeError);
  });
});

describe("transcript ids", () => {
  it("upper-cases the ticker so a lowercase caller resolves the same document", () => {
    expect(transcriptId("2026-09-02", "nem", "entry")).toBe("2026-09-02-NEM-entry");
  });

  it("renders the reference exactly as a DecisionRecord stores it", () => {
    expect(transcriptRef(transcriptId("2026-09-02", "NEM", "entry"))).toBe(
      "liveTranscripts/2026-09-02-NEM-entry"
    );
  });
});

describe("writeTranscript / readTranscript", () => {
  it("round-trips a transcript larger than one chunk", async () => {
    // The bug this module exists for: a transcript far past any single-document
    // ceiling has to survive the round trip intact.
    const text = "x".repeat(450_000) + "END";
    const meta = await writeTranscript("run-A-entry", text);

    expect(meta.chunks).toBe(3);
    expect(meta.chars).toBe(text.length);
    await expect(readTranscript("run-A-entry")).resolves.toBe(text);
  });

  it("stores an empty transcript as a document with no chunks", async () => {
    await writeTranscript("run-B-entry", "");
    await expect(readTranscript("run-B-entry")).resolves.toBe("");
  });

  it("returns null when nothing was ever written", async () => {
    await expect(readTranscript("never-written")).resolves.toBeNull();
  });

  it("does not leave the tail of a longer transcript behind on rerun", async () => {
    await writeTranscript("run-C-entry", "y".repeat(500_000));
    await writeTranscript("run-C-entry", "short");
    await expect(readTranscript("run-C-entry")).resolves.toBe("short");
  });
});
