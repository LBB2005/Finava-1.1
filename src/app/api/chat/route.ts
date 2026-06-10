import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { generate } from "@/lib/llm";
import { withAuthRaw } from "@/lib/withRoute";
import { ChatRequestSchema } from "@/lib/schemas/chat";
import { checkUsageLimit, recordUsage, usageStore } from "@/lib/usage";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const res = await withAuthRaw({ body: ChatRequestSchema })(req);
  if (res instanceof NextResponse) return res;

  const { userId, body } = res;
  const { messages, portfolioContext } = body;

  // Hard cap: block before any model spend if the user is over their allowance.
  const limited = await checkUsageLimit(userId);
  if (limited) return limited;

  // Run the whole stream inside the usage context so every model call it makes
  // (this chat message + the follow-up generate()) is metered to this user.
  return usageStore.run({ userId }, () => {
    const systemPrompt = `You are Finava, an expert AI financial research assistant. You help users research stocks, analyze their portfolio, and make informed investment decisions.

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

    // Follow-up suggestions depend only on the user's question, so run the
    // (cheap) call concurrently with the main stream instead of serializing it
    // after the last token. `.catch` attached immediately so an early rejection
    // can never surface as an unhandled rejection.
    const followupsPromise: Promise<string | null> = generate({
      agent: "chatFollowups",
      maxTokens: 120,
      prompt: `Generate exactly 3 short follow-up research questions (max 12 words each). Return a JSON array of strings only.\n\nQuestion: ${lastUserText.slice(0, 200)}`,
    }).catch(() => null);

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
          // Meter this chat message's token usage against the user's allowance.
          try {
            const final = await stream.finalMessage();
            await recordUsage({
              agent: "chat",
              model: MODEL,
              inputTokens: final.usage?.input_tokens,
              outputTokens: final.usage?.output_tokens,
              cacheRead: final.usage?.cache_read_input_tokens,
            });
          } catch { /* metering is best-effort */ }
          // Emit follow-up suggestions (started concurrently with the stream)
          try {
            const raw = await followupsPromise;
            const match = raw?.match(/\[[\s\S]*\]/);
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
  });
}
