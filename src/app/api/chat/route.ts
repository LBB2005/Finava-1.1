import { anthropic, MODEL } from "@/lib/anthropic";
import { generate } from "@/lib/llm";
import { requireAuth } from "@/lib/requireAuth";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const { messages, portfolioContext } = await req.json();

  const systemPrompt = `You are Lucra, an expert AI financial research assistant. You help users research stocks, analyze their portfolio, and make informed investment decisions.

${portfolioContext ? `## User's Current Portfolio\n${portfolioContext}` : "The user has no portfolio holdings yet."}

Be concise, data-driven, and actionable. When making recommendations, always note that this is not financial advice. Use markdown formatting for clarity (tables, bullet points, etc.).`;

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system: [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } } as any,
    ],
    messages: messages as MessageParam[],
  });

  const lastUserContent = (messages as MessageParam[]).at(-1);
  const lastUserText =
    typeof lastUserContent?.content === "string"
      ? lastUserContent.content
      : "";

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const data = JSON.stringify({ text: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }
        // Generate follow-up suggestions
        try {
          const raw = await generate({
            agent: "chatFollowups",
            maxTokens: 120,
            prompt: `Generate exactly 3 short follow-up research questions (max 12 words each). Return a JSON array of strings only.\n\nQuestion: ${lastUserText.slice(0, 200)}`,
          });
          const match = raw.match(/\[[\s\S]*\]/);
          if (match) {
            const questions = JSON.parse(match[0]) as string[];
            if (Array.isArray(questions) && questions.length > 0) {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ followups: questions.slice(0, 3).map(String) })}\n\n`
              ));
            }
          }
        } catch { /* follow-ups are best-effort */ }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy/CDN buffering so SSE chunks flush immediately on Vercel.
      "X-Accel-Buffering": "no",
    },
  });
}
