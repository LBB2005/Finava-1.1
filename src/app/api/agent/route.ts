import { runCeoAgent } from "@/agents/ceo";
import { runDiscoveryWave, runDiscoverySynthesis } from "@/agents/discovery";
import { requireAuth } from "@/lib/requireAuth";
import type { AgentEvent } from "@/types/chat";
import type { WaveRequest, SynthesizeRequest } from "@/lib/scoutTypes";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const {
    userPrompt,
    portfolioContext,
    deepResearch,
    conversationHistory,
    holdings,
    discover,
    tier,
    wave,
  } = await req.json();

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const emit = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        if (wave && wave.synthesize) {
          // Final discovery synthesis — one Sonnet pass, no crew.
          await runDiscoverySynthesis(wave as SynthesizeRequest, emit);
        } else if (wave) {
          // One deterministic crew wave over ≤5 names.
          await runDiscoveryWave(wave as WaveRequest, emit);
        } else {
          // Normal CEO turn (incl. quick discover + deep shortlist emit).
          await runCeoAgent(userPrompt, portfolioContext ?? "", emit, {
            deepResearch: !!deepResearch,
            conversationHistory: conversationHistory ?? [],
            userId,
            holdings: Array.isArray(holdings) ? holdings : [],
            discover: !!discover,
            tier: tier === "deep" ? "deep" : "quick",
          });
        }
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
