import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";
import { sanitizeFormats } from "@/lib/templates";

function playbooksCol(uid: string) {
  return db.collection("users").doc(uid).collection("playbooks");
}

const MAX_PLAYBOOKS = 50;
const MAX_STEPS = 20;
const MAX_STEP_CHARS = 2000;
const MAX_TITLE_CHARS = 80;
const MAX_INSTRUCTIONS_CHARS = 2000;

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

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_CHARS) : "";
    const rawSteps = Array.isArray(body.steps) ? body.steps : [];
    const steps = rawSteps
      .filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
      .slice(0, MAX_STEPS)
      .map((s: string) => s.trim().slice(0, MAX_STEP_CHARS));
    const instructions =
      typeof body.instructions === "string" ? body.instructions.trim().slice(0, MAX_INSTRUCTIONS_CHARS) : "";
    const formats = sanitizeFormats(body.formats ?? body.format);
    // A template needs a title and at least one payload — a starter prompt, some
    // response instructions, or a chosen format.
    if (!title || (steps.length === 0 && !instructions && formats.length === 0)) {
      return NextResponse.json(
        { error: "A name and at least a prompt, instructions, or a format are required" },
        { status: 400 }
      );
    }

    const data = {
      userId,
      title,
      steps,
      instructions,
      formats,
      sourceConversationId: typeof body.sourceConversationId === "string" ? body.sourceConversationId : null,
      createdAt: new Date().toISOString(),
    };
    const docRef = playbooksCol(userId).doc();
    await docRef.set(data);
    return NextResponse.json(serializeDoc(docRef.id, data), { status: 201 });
  } catch (err) {
    console.error("[playbooks POST]", err);
    return NextResponse.json({ error: "Failed to save playbook" }, { status: 500 });
  }
}
