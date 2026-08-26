import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { withRoute } from "@/lib/withRoute";
import { getFactorUniverse } from "@/lib/factorUniverse";
import { readCachedDna, deriveAndCacheDna } from "@/lib/investorDnaStore";
import { lensLineFor } from "@/lib/investorDna";

/**
 * GET /api/dna/lens?ticker=XYZ — the one-line personalized whisper the stock
 * page renders. Compares the stock's dominant factor to the user's track
 * record. `{ line: null }` when there's nothing personal to say, the ticker is
 * unscored, or DNA is disabled.
 */
export const GET = withRoute({}, async ({ req, userId }) => {
  const ticker = new URL(req.url).searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ line: null });

  const settingsSnap = await db.collection("userSettings").doc(userId).get();
  const allowed = (settingsSnap.data()?.allowInvestorDNA as boolean | undefined) ?? true;
  if (!allowed) return NextResponse.json({ line: null });

  const dna = (await readCachedDna(userId)) ?? (await deriveAndCacheDna(userId));
  if (!dna) return NextResponse.json({ line: null });

  const universe = await getFactorUniverse();
  const stock = universe.stocks.find((s) => s.ticker.toUpperCase() === ticker) ?? null;

  const result = lensLineFor(dna, stock);
  return NextResponse.json(result ?? { line: null });
});
