import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";
import { withRoute } from "@/lib/withRoute";
import { apiError } from "@/lib/apiError";
import { sanitizeFormats } from "@/lib/templates";
import { CreatePlaybookSchema } from "@/lib/schemas/playbook";

function playbooksCol(uid: string) {
  return db.collection("users").doc(uid).collection("playbooks");
}

const MAX_PLAYBOOKS = 50;

export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const snap = await playbooksCol(userId)
      .orderBy("createdAt", "desc")
      .limit(MAX_PLAYBOOKS)
      .get();
    return NextResponse.json(snap.docs.map((d) => serializeDoc(d.id, d.data())));
  } catch (err) {
    console.error("[playbooks GET]", err);
    return NextResponse.json({ error: "Failed to load playbooks" }, { status: 500 });
  }
}

export const POST = withRoute({ body: CreatePlaybookSchema }, async ({ userId, body }) => {
  const { title, steps, instructions, sourceConversationId } = body;
  // `formats` is validated loosely by the schema; sanitizeFormats is the
  // authoritative allow-list (and folds in the legacy singular `format`).
  const formats = sanitizeFormats(body.formats ?? body.format);
  // The schema guarantees a non-empty title; a template still needs at least one
  // payload — a starter prompt, some response instructions, or a chosen format.
  if (steps.length === 0 && !instructions && formats.length === 0) {
    return apiError(
      "empty_playbook",
      "A name and at least a prompt, instructions, or a format are required",
      400
    );
  }

  const data = {
    userId,
    title,
    steps,
    instructions,
    formats,
    sourceConversationId,
    createdAt: new Date().toISOString(),
  };
  const docRef = playbooksCol(userId).doc();
  await docRef.set(data);
  return NextResponse.json(serializeDoc(docRef.id, data), { status: 201 });
});
