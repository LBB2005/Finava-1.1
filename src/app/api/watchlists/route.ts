// src/app/api/watchlists/route.ts
import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";
import type { Watchlist } from "@/types/watchlist";

function watchlistsCol(uid: string) {
  return db.collection("users").doc(uid).collection("watchlists");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toWatchlist(row: any): Watchlist {
  return {
    id: row.id,
    name: row.name,
    tickers: Array.isArray(row.tickers) ? row.tickers : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Uppercase, trim, drop blanks, de-dupe — preserving first-seen order. */
export function normalizeTickers(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    const sym = t.trim().toUpperCase();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}

export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const snap = await watchlistsCol(userId).orderBy("createdAt", "asc").get();
    return NextResponse.json(
      snap.docs.map((doc) => toWatchlist(serializeDoc(doc.id, doc.data())))
    );
  } catch (err) {
    console.error("[watchlists GET]", err);
    return NextResponse.json({ error: "Failed to fetch watchlists" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const body = await req.json();
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New watchlist";
    const now = new Date().toISOString();
    const docRef = await watchlistsCol(userId).add({
      userId,
      name,
      tickers: normalizeTickers(body.tickers),
      createdAt: now,
      updatedAt: now,
    });
    const snap = await docRef.get();
    return NextResponse.json(toWatchlist(serializeDoc(snap.id, snap.data()!)));
  } catch (err) {
    console.error("[watchlists POST]", err);
    return NextResponse.json({ error: "Failed to create watchlist" }, { status: 500 });
  }
}
