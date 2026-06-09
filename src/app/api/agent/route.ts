import { runCeoAgent } from "@/agents/ceo";
import { requireAuth } from "@/lib/requireAuth";
import type { AgentEvent } from "@/types/chat";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const { userPrompt, portfolioContext, deepResearch, conversationHistory, holdings } = await req.json();

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const emit = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await runCeoAgent(userPrompt, portfolioContext ?? "", emit, !!deepResearch, conversationHistory ?? [], userId, Array.isArray(holdings) ? holdings : []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("[agent route error]", err);
        emit({ type: "error", message: msg });
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
