import { vi } from "vitest";

/** In-memory stand-in for the Firebase Admin Firestore surface the app uses:
 *  db.collection(...).doc(...).get()/set()/update(), and simple collection queries.
 *  Seed with plain objects keyed by `${collection}/${id}`. */
export function makeFirestoreMock(seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed));

  const docRef = (path: string) => ({
    id: path.split("/").pop()!,
    get: vi.fn(async () => ({
      exists: store.has(path),
      id: path.split("/").pop()!,
      data: () => store.get(path),
    })),
    set: vi.fn(async (v: unknown, opts?: { merge?: boolean }) => {
      store.set(
        path,
        opts?.merge ? { ...(store.get(path) as object), ...(v as object) } : v,
      );
    }),
    update: vi.fn(async (v: unknown) => {
      store.set(path, { ...(store.get(path) as object), ...(v as object) });
    }),
  });

  const collectionRef = (col: string) => ({
    doc: (id: string) => docRef(`${col}/${id}`),
    where: vi.fn(() => collectionRef(col)),
    get: vi.fn(async () => ({
      docs: [...store.entries()]
        .filter(([k]) => k.startsWith(`${col}/`))
        .map(([k, v]) => ({ id: k.split("/").pop()!, data: () => v })),
    })),
  });

  return { db: { collection: (c: string) => collectionRef(c) }, store };
}
