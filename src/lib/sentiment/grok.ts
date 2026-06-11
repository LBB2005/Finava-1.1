/* ============================================================
   Finava · Sentiment — xAI Grok live X search
   ------------------------------------------------------------
   Grok is the only model with native real-time access to the X
   firehose. Via the Agent Tools API (/v1/responses + the x_search
   server-side tool) one call does search-and-assess and returns a
   synthesized answer with url_citation annotations to the source posts.

   NOTE: the older Live Search API (search_parameters on
   /v1/chat/completions) was DEPRECATED by xAI and now 410s — this
   client uses the replacement Agent Tools API. Tool use requires a
   grok-4-family model, hence the grok-4.3 default.

   The "degraded" guard: if x_search returns no real posts (no
   citations / model reports zero found), Grok will still answer from
   training data — that answer is unsourced and must NOT feed the
   composite. In that case we return confidence 0 so the caller drops
   the X signal and its weight redistributes.

   Failure-isolated: no XAI_API_KEY or any error → returns null.
   ============================================================ */

import { recordUsage } from "@/lib/usage";

const XAI_URL = "https://api.x.ai/v1/responses";
const XAI_MODEL = process.env.XAI_MODEL || "grok-4.3";
const FLAT_CREDITS = 120; // ≈ $0.12 per x_search call (TUNE to live rates)

// A small set of widely-followed finance handles to bias the search toward
// signal over noise. Kept short (xAI caps handle filters); not exhaustive.
const FINANCE_HANDLES = [
  "DeItaone",
  "unusual_whales",
  "Stocktwits",
  "charliebilello",
  "zerohedge",
  "FirstSquawk",
];

export interface GrokSentiment {
  /** Mean polarity of assessed posts, [-1,+1]. */
  score: number;
  /** Confidence [0,1]; 0 when the X search was degraded (no real posts). */
  confidence: number;
  foundPosts: number;
  degraded: boolean;
  detail: string;
  citations: string[];
}

export async function getGrokSentiment(
  ticker: string,
  companyName?: string
): Promise<GrokSentiment | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;

  const subject = companyName ? `${ticker} (${companyName})` : ticker;
  try {
    const res = await fetch(XAI_URL, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: XAI_MODEL,
        temperature: 0.1,
        // Agent Tools API: the model invokes the x_search server-side tool,
        // biased to curated finance handles for signal over noise.
        tools: [{ type: "x_search", allowed_x_handles: FINANCE_HANDLES }],
        instructions:
          "You assess real-time X/Twitter sentiment about a stock. Use ONLY actual posts found by x_search. If the search returns no relevant posts, report foundPosts: 0 — do not invent sentiment from memory.",
        input: [
          {
            role: "user",
            content: `Search X for recent posts about ${subject}. Assess each relevant post's stance on the stock.

Respond with ONLY a JSON object, no prose: {"foundPosts": <integer count of real posts assessed>, "score": <-1..1 mean stance, bullish positive>, "summary": "<1-2 sentences on the narrative and notable posts>"}.`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    void recordUsage({ agent: "sentiment-grok", model: `xai/${XAI_MODEL}`, flatCredits: FLAT_CREDITS });

    // Responses API: the final answer is the `message` item in output[];
    // citations are url_citation annotations on its text content.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const output: any[] = Array.isArray(data.output) ? data.output : [];
    const message = output.find((o) => o?.type === "message");
    const textPart = message?.content?.find((c: any) => c?.type === "output_text");
    const content: string = textPart?.text ?? "";
    const citations: string[] = (textPart?.annotations ?? [])
      .filter((a: any) => a?.type === "url_citation" && typeof a.url === "string")
      .map((a: any) => a.url as string);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : null;

    const foundPosts =
      typeof parsed?.foundPosts === "number" ? Math.max(0, Math.round(parsed.foundPosts)) : 0;
    const rawScore = typeof parsed?.score === "number" ? parsed.score : 0;
    const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";

    // Degraded = the live search found nothing real. Citations corroborate.
    const degraded = foundPosts === 0 || citations.length === 0;
    const score = Math.max(-1, Math.min(1, rawScore));
    // Confidence scales with how many real posts were assessed (cap ~15).
    const confidence = degraded ? 0 : Math.max(0, Math.min(1, foundPosts / 15));

    return {
      score,
      confidence,
      foundPosts,
      degraded,
      detail: degraded
        ? "X live search returned no usable posts — signal dropped."
        : `${foundPosts} X posts assessed. ${summary}`.trim(),
      citations: citations.slice(0, 6),
    };
  } catch {
    return null;
  }
}
