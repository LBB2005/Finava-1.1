// Stub Firebase / firebase-admin so the transitive import chain
// grok → usage → firebase-admin doesn't crash with an RSA parse error
// when running pure-helper tests (assembleScoreInputs is never called here).
import { vi } from "vitest";

vi.mock("firebase-admin", () => {
  const stub = () => ({});
  return {
    default: {
      apps: [],
      initializeApp: stub,
      credential: { cert: stub },
      auth: stub,
      firestore: stub,
    },
    apps: [],
    initializeApp: stub,
    credential: { cert: stub },
    auth: stub,
    firestore: stub,
  };
});

vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: {},
  db: {
    collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }), set: async () => {} }) }),
  },
  deleteRefsInBatches: async () => {},
}));
