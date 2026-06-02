// src/app/api/watchlists/[id]/route.ts
import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";
import { toWatchlist, normalizeTickers } from "@/lib/watchlist";

function docFor(uid: string, id: string) {
  return db.collection("users").doc(uid).collection("watchlists").doc(id);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const body = await req.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.tickers !== undefined) data.tickers = normalizeTickers(body.tickers);

    const docRef = docFor(userId, id);
    const existing = await docRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    await docRef.update(data);
    const snap = await docRef.get();
    return NextResponse.json(toWatchlist(serializeDoc(snap.id, snap.data()!)));
  } catch (err) {
    console.error("[watchlist PATCH]", err);
    return NextResponse.json({ error: "Failed to update watchlist" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const docRef = docFor(userId, id);
    const existing = await docRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    await docRef.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[watchlist DELETE]", err);
    return NextResponse.json({ error: "Failed to delete watchlist" }, { status: 500 });
  }
}
