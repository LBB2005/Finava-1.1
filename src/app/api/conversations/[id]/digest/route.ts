import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";
import { anthropic, MODEL } from "@/lib/anthropic";
import { checkUsageLimit, recordUsage, usageStore } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

// Transcript caps so a runaway thread can't blow up the prompt.
const MAX_MESSAGES = 200;
const MAX_CHARS_PER_MESSAGE = 4000;
const MAX_TOTAL_CHARS = 80_000;

const SYSTEM_PROMPT = `You are Finava's research-digest writer. Distil a chat transcript between a user and Finava (an AI financial research assistant) into a crisp briefing the user can save or share.

Output markdown with exactly these sections (omit a section only if truly empty):

## Key Insights
3-6 bullets of the most important findings or conclusions.

## Tickers Discussed
One bullet per ticker: **TICKER** — one-line takeaway.

## Decisions & Next Steps
Bullets for anything the user decided, or concrete follow-ups suggested.

Be specific and data-driven — keep the numbers that matter. No preamble, no closing remarks, under 300 words.`;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const limited = await checkUsageLimit(userId);
  if (limited) return limited;

  try {
    const { id } = await params;
    const docRef = db
      .collection("users").doc(userId)
      .collection("conversations").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const msgSnap = await docRef
      .collection("messages")
      .orderBy("createdAt")
      .limit(MAX_MESSAGES)
      .get();

    let total = 0;
    const transcript: string[] = [];
    for (const m of msgSnap.docs) {
      const { role, content } = m.data() as { role?: string; content?: string };
      if (!content) continue;
      const text = content.slice(0, MAX_CHARS_PER_MESSAGE);
      total += text.length;
      if (total > MAX_TOTAL_CHARS) break;
      transcript.push(`${role === "user" ? "User" : "Finava"}: ${text}`);
    }

    if (transcript.length === 0) {
      return NextResponse.json({ error: "Nothing to digest yet" }, { status: 400 });
    }

    const digest = await usageStore.run({ userId }, async () => {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: transcript.join("\n\n") }],
      });
      await recordUsage({
        agent: "digest",
        model: MODEL,
        inputTokens: msg.usage?.input_tokens,
        outputTokens: msg.usage?.output_tokens,
      }).catch(() => {});
      return msg.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");
    });

    return NextResponse.json({ digest });
  } catch (err) {
    console.error("[conversation digest]", err);
    return NextResponse.json({ error: "Failed to generate digest" }, { status: 500 });
  }
}
