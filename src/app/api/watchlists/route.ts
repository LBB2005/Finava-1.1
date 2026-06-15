// src/app/api/watchlists/route.ts
import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { assertWatchlistQuota } from "@/lib/entitlements";
import { withRoute } from "@/lib/withRoute";
import { toWatchlist } from "@/lib/watchlist";
import { CreateWatchlistSchema } from "@/lib/schemas/watchlist";

function watchlistsCol(uid: string) {
  return db.collection("users").doc(uid).collection("watchlists");
}

export const GET = withRoute({}, async ({ userId }) => {
  const snap = await watchlistsCol(userId).orderBy("createdAt", "asc").get();
  return NextResponse.json(
    snap.docs.map((doc) => toWatchlist(serializeDoc(doc.id, doc.data())))
  );
});

export const POST = withRoute({ body: CreateWatchlistSchema }, async ({ userId, body }) => {
  // Enforce the per-plan watchlist cap (Free = 1).
  const existing = await watchlistsCol(userId).count().get();
  const quota = await assertWatchlistQuota(userId, existing.data().count);
  if (quota) return quota;

  const now = new Date().toISOString();
  const docRef = await watchlistsCol(userId).add({
    userId,
    name: body.name,
    tickers: body.tickers,
    createdAt: now,
    updatedAt: now,
  });
  const snap = await docRef.get();
  return NextResponse.json(toWatchlist(serializeDoc(snap.id, snap.data()!)));
});
