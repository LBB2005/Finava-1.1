/**
 * Cached Finava verdict — persistence for the stock page's "cached-first" AI
 * cells (intelligence rail, Overview Read, Finava tab hydration).
 *
 * One doc per user per ticker at `users/{uid}/verdicts/{TICKER}`, written when
 * a 5-agent Finava Analysis run completes and read by
 * `GET /api/stock/[ticker]/verdict`. Stores the full analysis (signals +
 * verdict) so the client can hydrate the whole tab without re-running.
 *
 * Named verdictStore (not verdict.ts) because src/lib/verdict.ts is the
 * unrelated deterministic Research-board verdict.
 */
import { db } from "@/lib/firebase-admin";
import type { FinavaSignal, FinavaVerdict } from "@/lib/finava";

export interface CachedVerdict {
  verdict: FinavaVerdict;
  signals: FinavaSignal[];
  updatedAt: string; // ISO
}

function verdictDoc(uid: string, ticker: string) {
  return db
    .collection("users")
    .doc(uid)
    .collection("verdicts")
    .doc(ticker.trim().toUpperCase());
}

/** Persist a completed run. Never throws — a cache miss must not break a run. */
export async function saveVerdict(
  uid: string,
  ticker: string,
  verdict: FinavaVerdict,
  signals: FinavaSignal[]
): Promise<void> {
  try {
    await verdictDoc(uid, ticker).set({
      verdict,
      signals,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[verdictStore] save failed", ticker, err);
  }
}

/** Read the cached run, or null when the user has never run this ticker. */
export async function readVerdict(
  uid: string,
  ticker: string
): Promise<CachedVerdict | null> {
  const snap = await verdictDoc(uid, ticker).get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (!d || typeof d.verdict?.score !== "number" || typeof d.updatedAt !== "string") {
    return null; // malformed doc — treat as never-run rather than crash the rail
  }
  return {
    verdict: d.verdict as FinavaVerdict,
    signals: Array.isArray(d.signals) ? (d.signals as FinavaSignal[]) : [],
    updatedAt: d.updatedAt,
  };
}
