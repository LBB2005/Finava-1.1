// The append-only collection names, in a module with NO imports.
//
// Split out of ledger.ts so ledgerDiscipline.test.ts can read the list without
// pulling in firebase-admin (which validates server env at module load and so
// can't be imported by a test that only wants to grep the source tree).

export const LEDGER_COLLECTIONS = [
  "liveDecisions",
  "liveOrders",
  "liveFills",
  "liveEvaluations",
  "liveOutcomes",
  "liveSnapshots",
  "liveEvents",
] as const;

export type LedgerCollection = (typeof LEDGER_COLLECTIONS)[number];

/** First link of every chain. Published in SCORING.md so verifiers can start here. */
export const CHAIN_GENESIS = "0".repeat(64);

/**
 * Transcript chunk subcollection: `liveTranscripts/{transcriptId}/{TRANSCRIPT_CHUNKS}/{n}`.
 *
 * Named specifically rather than "chunks" because firestore.indexes.json carries
 * a single-field index exemption on its `text` field, and a fieldOverride keys on
 * the COLLECTION GROUP — a generic "chunks" would apply that exemption to every
 * subcollection of that name anywhere in the database. Without the exemption a
 * long transcript eventually blows the index-entry size limit and Firestore
 * rejects the write.
 *
 * Not a ledger collection: transcripts are referenced by `transcriptRef` on the
 * decision, and it is the decision that is hash-chained.
 */
export const TRANSCRIPT_CHUNKS = "transcriptChunks";
