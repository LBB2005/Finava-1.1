import { runCeoAgent } from "@/agents/ceo";
import { runDiscoveryWave, runDiscoverySynthesis } from "@/agents/discovery";
import { requireAuth } from "@/lib/requireAuth";
import {
  checkUsageLimit,
  checkDeepResearchAllowed,
  recordDeepResearchRun,
  usageStore,
} from "@/lib/usage";
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

  // Hard cap: block before any model spend if the user is over their allowance.
  const limited = await checkUsageLimit(userId);
  if (limited) return limited;

  // Deep Research is the one explicitly-counted op. Count a run only on the
  // initiating CEO turn — the follow-up `wave`/`synthesize` calls are
  // continuations of an already-counted run and must not be re-charged or
  // stranded mid-session by the cap.
  const isDeepInitiation = !wave && (!!deepResearch || tier === "deep");
  if (isDeepInitiation) {
    const deepLimited = await checkDeepResearchAllowed(userId);
    if (deepLimited) return deepLimited;
    // Increment at run START (not completion) so a burst of concurrent runs
    // can't all slip past the pre-check. A failed run still counts — an
    // accepted anti-abuse trade-off.
    void recordDeepResearchRun(userId);
  }

  // Run the whole crew inside the usage context so every sub-agent generate()
  // call and the CEO's direct Anthropic turns are metered to this user.
  return usageStore.run({ userId }, () => {
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
  });
}
