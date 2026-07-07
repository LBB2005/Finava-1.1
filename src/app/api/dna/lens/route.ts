import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { withRoute } from "@/lib/withRoute";
import { getFactorUniverse } from "@/lib/factorUniverse";
import { readCachedDna, deriveAndCacheDna } from "@/lib/investorDnaStore";
import { lensLineFor, type LensConviction } from "@/lib/investorDna";

/**
 * GET /api/dna/lens?ticker=XYZ — the one-line personalized whisper the stock
 * page renders. Conviction-aware (a thesis on the ticker wins), else it compares
 * the stock's dominant factor to the user's track record. `{ line: null }` when
 * there's nothing personal to say, the ticker is unscored, or DNA is disabled.
 */
export const GET = withRoute({}, async ({ req, userId }) => {
  const ticker = new URL(req.url).searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ line: null });

  const settingsSnap = await db.collection("userSettings").doc(userId).get();
  const allowed = (settingsSnap.data()?.allowInvestorDNA as boolean | undefined) ?? true;
  if (!allowed) return NextResponse.json({ line: null });

  // A conviction on this ticker wins and doesn't need the DNA vector.
  const convSnap = await db
    .collection("users").doc(userId).collection("convictions")
    .where("ticker", "==", ticker).limit(1).get();
  const conviction: LensConviction | null = convSnap.empty
    ? null
    : (() => {
        const c = convSnap.docs[0].data();
        return { thesisTrait: c.thesisTrait, status: c.status, outcomePct: c.outcomePct ?? null };
      })();

  const dna = (await readCachedDna(userId)) ?? (await deriveAndCacheDna(userId));
  if (!conviction && !dna) return NextResponse.json({ line: null });

  const universe = await getFactorUniverse();
  const stock = universe.stocks.find((s) => s.ticker.toUpperCase() === ticker) ?? null;

  const result = lensLineFor(dna, stock, conviction);
  return NextResponse.json(result ?? { line: null });
});
