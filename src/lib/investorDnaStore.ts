/**
 * Investor DNA — Firestore wrappers around the pure engine in `@/lib/investorDna`.
 *
 * Kept separate so the engine itself imports no infra (firebase-admin would
 * otherwise initialize at module load and break unit tests). The cached snapshot
 * lives at `users/{uid}/investorDNA/current`.
 */

import { db } from "@/lib/firebase-admin";
import { getFactorUniverse } from "@/lib/factorUniverse";
import { computeInvestorDna, type DnaHolding } from "@/lib/investorDna";
import { ETF_PROFILES } from "@/lib/extraUniverse";
import type { InvestorDNA } from "@/types/dna";

function dnaDoc(userId: string) {
  return db.collection("users").doc(userId).collection("investorDNA").doc("current");
}

/** Recompute fresh from holdings + the scored universe, write the snapshot, return it. */
export async function deriveAndCacheDna(userId: string): Promise<InvestorDNA | null> {
  // Short-circuit before the expensive factor-universe compute: a user with no
  // holdings has no DNA to derive, so new users hit the empty state instantly
  // instead of waiting on a full S&P scoring pass they don't need.
  const holdingsSnap = await db.collection("users").doc(userId).collection("holdings").get();
  if (holdingsSnap.empty) return null;

  const holdings = holdingsSnap.docs.map((d) => d.data() as DnaHolding);
  const [convSnap, universe] = await Promise.all([
    db.collection("users").doc(userId).collection("convictions").select().get(),
    getFactorUniverse(),
  ]);
  const dna = computeInvestorDna(holdings, universe.stocks, convSnap.size, ETF_PROFILES);
  if (dna) {
    await dnaDoc(userId).set(dna).catch((e) => console.error("[investorDna] cache write", e));
  }
  return dna;
}

/** Read the cached snapshot (fast path for the Lens); null if never derived. */
export async function readCachedDna(userId: string): Promise<InvestorDNA | null> {
  try {
    const snap = await dnaDoc(userId).get();
    return snap.exists ? (snap.data() as InvestorDNA) : null;
  } catch {
    return null;
  }
}
