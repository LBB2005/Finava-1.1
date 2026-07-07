import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { apiError } from "@/lib/apiError";
import { withRoute } from "@/lib/withRoute";
import { UpdateConvictionSchema } from "@/lib/schemas/conviction";

function convictionDoc(uid: string, id: string) {
  return db.collection("users").doc(uid).collection("convictions").doc(id);
}

const PATCH_FIELDS = [
  "direction",
  "thesisTrait",
  "factorTags",
  "reasoning",
  "falsifier",
  "confidence",
  "status",
  "outcomePct",
] as const;

export const GET = withRoute(
  {},
  async ({ userId }, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const snap = await convictionDoc(userId, id).get();
    if (!snap.exists) return apiError("not_found", "Not found", 404);
    return NextResponse.json(serializeDoc(snap.id, snap.data()!));
  }
);

/** PATCH — update a thesis (e.g. mark it playing out / broken / closed, set outcome). */
export const PATCH = withRoute(
  { body: UpdateConvictionSchema },
  async ({ userId, body }, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ref = convictionDoc(userId, id);
    const existing = await ref.get();
    if (!existing.exists) return apiError("not_found", "Not found", 404);

    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of PATCH_FIELDS) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    await ref.update(data);
    const snap = await ref.get();
    return NextResponse.json(serializeDoc(snap.id, snap.data()!));
  }
);

export const DELETE = withRoute(
  {},
  async ({ userId }, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ref = convictionDoc(userId, id);
    const snap = await ref.get();
    if (!snap.exists) return apiError("not_found", "Not found", 404);
    await ref.delete();
    return NextResponse.json({ ok: true });
  }
);
