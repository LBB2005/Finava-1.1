// Read side of the ledger.
//
// Split from ledger.ts so the write path stays small enough to audit at a glance
// — that file's whole job is the append-only guarantee, and mixing queries into
// it makes the one property that matters harder to see. ledgerDiscipline.test.ts
// allows exactly these two modules to name a live* collection, so every read is
// here and every write is there.
//
// Reads only. Nothing in this file may write.

import { db } from "@/lib/firebase-admin";
import type { BookSnapshot } from "@/lib/schemas/live/snapshot";
import type { DecisionRecord } from "@/lib/schemas/live/decision";

/** Firestore caps an `in` filter at 30 values. */
const IN_CHUNK = 30;

/**
 * The most recent snapshot strictly before `tradingDay`.
 *
 * Carries the high-water mark and the freeze countdown into today's run. Strictly
 * before, not `<=`: on a replay today's own snapshot already exists, and reading
 * it back as "yesterday" would reset the drawdown baseline to today's equity and
 * silently discharge a live freeze.
 */
export async function getPriorSnapshot(tradingDay: string): Promise<BookSnapshot | null> {
  const snap = await db
    .collection("liveSnapshots")
    .where("tradingDay", "<", tradingDay)
    .orderBy("tradingDay", "desc")
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as BookSnapshot);
}

export async function getSnapshot(tradingDay: string): Promise<BookSnapshot | null> {
  const doc = await db.collection("liveSnapshots").doc(tradingDay).get();
  return doc.exists ? (doc.data() as BookSnapshot) : null;
}

export interface OpeningDecision {
  decisionId: string;
  tradingDay: string;
}

/**
 * The decision that most recently opened or added to each of `tickers`.
 *
 * This is the join that puts a thesis one hop from every held position. A ticker
 * with no hit is simply absent — a position the ledger cannot explain must read
 * as unexplained, never as explained by the nearest decision to hand.
 */
export async function getOpeningDecisions(
  tickers: string[]
): Promise<Map<string, OpeningDecision>> {
  const out = new Map<string, OpeningDecision>();
  if (!tickers.length) return out;

  for (let i = 0; i < tickers.length; i += IN_CHUNK) {
    const snap = await db
      .collection("liveDecisions")
      .where("ticker", "in", tickers.slice(i, i + IN_CHUNK))
      .where("kind", "in", ["entry", "add"])
      .orderBy("tradingDay", "desc")
      .get();
    for (const doc of snap.docs) {
      const d = doc.data() as DecisionRecord;
      // Ordered desc, so the first hit for a ticker is its most recent opener.
      if (!out.has(d.ticker)) {
        out.set(d.ticker, { decisionId: d.decisionId, tradingDay: d.tradingDay });
      }
    }
  }
  return out;
}

/** Every decision recorded on a trading day — entries, exits AND rejections. */
export async function getDecisionsForDay(tradingDay: string): Promise<DecisionRecord[]> {
  const snap = await db
    .collection("liveDecisions")
    .where("tradingDay", "==", tradingDay)
    .get();
  return snap.docs.map((d) => d.data() as DecisionRecord);
}

/** How many NEW entries the book has already taken today, for the max-3 rail. */
export async function countEntriesToday(tradingDay: string): Promise<number> {
  const snap = await db
    .collection("liveDecisions")
    .where("tradingDay", "==", tradingDay)
    .where("kind", "==", "entry")
    .get();
  return snap.size;
}

/** Open positions' decisions, for the export step and the invalidation evaluator. */
export async function getDecisionsByIds(ids: string[]): Promise<DecisionRecord[]> {
  if (!ids.length) return [];
  const out: DecisionRecord[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const snap = await db
      .collection("liveDecisions")
      .where("decisionId", "in", ids.slice(i, i + IN_CHUNK))
      .get();
    out.push(...snap.docs.map((d) => d.data() as DecisionRecord));
  }
  return out;
}
