// Debate and synthesis transcripts, stored outside the run document.
//
// Two bugs meet here, and both are the reason this module exists.
//
// The first is a hard limit. liveRuns/{runId} carries every step's result in ONE
// Firestore document, and Firestore refuses any document over 1 MiB. A 12-agent
// debate transcript runs to a few hundred kilobytes, so on 2026-09-02 the third
// debate of the day pushed the run document to 1,051,317 bytes and the write was
// rejected — discarding an eleven-minute step whose model calls had already been
// paid for. Transcripts are the only unbounded thing a step produces, so they
// are the thing that has to move.
//
// The second is a dangling reference. Every DecisionRecord carries
// `transcriptRef: "liveTranscripts/{runId}-{ticker}-{mode}"`, and until now
// nothing ever wrote that document: the published record pointed at the
// reasoning behind each decision, and the reasoning was not there. Writing the
// transcript to exactly the path the decision names fixes the record and the
// size ceiling in one move.
//
// Not part of the append-only ledger — see ledgerCollections.ts, which explains
// why the chunk subcollection is named specifically rather than "chunks".

import { db } from "@/lib/firebase-admin";
import { TRANSCRIPT_CHUNKS } from "./ledgerCollections";

/**
 * Characters per chunk.
 *
 * A UTF-8 character can take four bytes, so 200k characters is at most ~800 KB —
 * inside the 1 MiB document ceiling with room for the wrapper fields. Bigger
 * chunks would risk the very limit this module exists to avoid; smaller ones
 * would multiply reads for no benefit.
 */
export const CHUNK_CHARS = 200_000;

/** Zero-padded so lexicographic document-id order IS chunk order past chunk 9. */
function chunkDocId(n: number): string {
  return String(n).padStart(4, "0");
}

/** The id a decision's `transcriptRef` resolves to. One definition, imported by
    both the step that writes the transcript and the step that references it. */
export function transcriptId(runId: string, ticker: string, mode: string): string {
  return `${runId}-${ticker.toUpperCase()}-${mode}`;
}

/** The stored reference form, as it appears on a DecisionRecord. */
export function transcriptRef(id: string): string {
  return `liveTranscripts/${id}`;
}

/** Pure. Split for storage; empty text stores no chunks at all. */
export function chunkText(text: string, size: number = CHUNK_CHARS): string[] {
  if (size <= 0) throw new RangeError("chunk size must be positive");
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

export interface TranscriptMeta {
  chunks: number;
  chars: number;
  createdAt: string;
}

/**
 * Write a transcript at `id`, replacing any transcript already there.
 *
 * Overwrites rather than appends because a step that re-runs produces a new
 * transcript for the same id, and a half-replaced transcript would be worse than
 * either version. Stale chunks beyond the new length are deleted, so a shorter
 * rerun cannot leave the tail of a longer one attached.
 */
export async function writeTranscript(id: string, text: string): Promise<TranscriptMeta> {
  const chunks = chunkText(text);
  const doc = db.collection("liveTranscripts").doc(id);
  const meta: TranscriptMeta = {
    chunks: chunks.length,
    chars: text.length,
    createdAt: new Date().toISOString(),
  };

  const batch = db.batch();
  batch.set(doc, meta);
  chunks.forEach((chunk, n) => {
    batch.set(doc.collection(TRANSCRIPT_CHUNKS).doc(chunkDocId(n)), { n, text: chunk });
  });
  await batch.commit();

  // Drop any chunks left over from a longer previous write. Done after the new
  // chunks land so a crash between the two leaves too much rather than too little.
  const existing = await doc.collection(TRANSCRIPT_CHUNKS).get();
  const stale = existing.docs.filter((d) => Number(d.get("n")) >= chunks.length);
  if (stale.length) {
    const cleanup = db.batch();
    for (const d of stale) cleanup.delete(d.ref);
    await cleanup.commit();
  }

  return meta;
}

/** Reassemble a transcript, or null when none was ever written at `id`. */
export async function readTranscript(id: string): Promise<string | null> {
  const doc = db.collection("liveTranscripts").doc(id);
  const meta = await doc.get();
  if (!meta.exists) return null;

  const chunks = await doc.collection(TRANSCRIPT_CHUNKS).get();
  return chunks.docs
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((d) => String(d.get("text") ?? ""))
    .join("");
}
