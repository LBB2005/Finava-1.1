import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentEvent } from "@/types/chat";

// ── Scripted Anthropic stream ────────────────────────────────────────────────
// runCeoAgent calls anthropic.messages.stream(...).finalMessage() once per loop
// turn. We feed a queue of scripted final messages.
const finalMessages: unknown[] = [];
const streamSpy = vi.fn(() => ({
  finalMessage: () => Promise.resolve(finalMessages.shift()),
}));
vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { stream: streamSpy } },
  MODEL: "test-model",
}));

// generate() backs the skeptic critique + follow-ups — return empty so the
// revision pass short-circuits (keeps the draft) and no follow-ups emit.
const generate = vi.fn(async () => "");
vi.mock("@/lib/llm", () => ({ generate, AGENT_MODELS: {} }));
vi.mock("@/lib/models", () => ({ badgeBrands: () => [] }));
vi.mock("@/lib/usage", () => ({ recordUsage: vi.fn(async () => {}) }));

const checkCache = vi.fn(async () => null as string | null);
vi.mock("@/lib/agentMemory", () => ({
  checkCache: (...a: unknown[]) => checkCache(...(a as [])),
  saveCache: vi.fn(async () => {}),
  extractTickers: vi.fn(() => []),
  getTickerMemory: vi.fn(async () => ""),
  saveTickerMemory: vi.fn(async () => {}),
}));
vi.mock("@/lib/userPreference", () => ({
  getUserPreference: vi.fn(async () => undefined),
  buildStylePrompt: vi.fn(() => ""),
  updateStyleFromConversation: vi.fn(async () => {}),
}));
vi.mock("@/lib/templates.server", () => ({ getTemplateBlock: vi.fn(async () => "") }));
vi.mock("./tools/index", () => ({ allTools: [], scoutTool: { name: "scout_universe" } }));

// Sub-agents: risk succeeds, news throws (failure isolation). Rest are stubs.
const runRiskAgent = vi.fn(async () => "RISK: weighted beta 1.1");
const runNewsAgent = vi.fn(async () => {
  throw new Error("news upstream 500");
});
vi.mock("./sub-agents/risk-agent", () => ({ runRiskAgent: (...a: unknown[]) => runRiskAgent(...(a as [])) }));
vi.mock("./sub-agents/news-agent", () => ({ runNewsAgent: () => runNewsAgent() }));
const stub = (name: string) => ({ [name]: vi.fn(async () => `${name} ok`) });
vi.mock("./sub-agents/macro-agent", () => stub("runMacroAgent"));
vi.mock("./sub-agents/technical-agent", () => stub("runTechnicalAgent"));
vi.mock("./sub-agents/dcf-agent", () => stub("runDcfAgent"));
vi.mock("./sub-agents/earnings-agent", () => stub("runEarningsAgent"));
vi.mock("./sub-agents/insider-agent", () => stub("runInsiderAgent"));
vi.mock("./sub-agents/sentiment-agent", () => stub("runSentimentAgent"));
vi.mock("./sub-agents/competitor-agent", () => stub("runCompetitorAgent"));
vi.mock("./sub-agents/options-agent", () => stub("runOptionsAgent"));
vi.mock("./sub-agents/comparables-agent", () => stub("runComparablesAgent"));
vi.mock("./sub-agents/graham-agent", () => stub("runGrahamAgent"));
vi.mock("./sub-agents/analyst-agent", () => stub("runAnalystAgent"));
vi.mock("./sub-agents/hype-agent", () => stub("runHypeAgent"));
vi.mock("./sub-agents/fundamentals-agent", () => stub("runFundamentalsAgent"));
vi.mock("./sub-agents/scout-agent", () => ({ runScoutAgent: vi.fn(async () => "scout picks") }));

const toolUse = (id: string, name: string) => ({ type: "tool_use", id, name, input: {} });
const text = (t: string) => ({ type: "text", text: t });

beforeEach(() => {
  finalMessages.length = 0;
  streamSpy.mockClear();
  checkCache.mockReset().mockResolvedValue(null);
  runRiskAgent.mockClear();
  runNewsAgent.mockClear();
});

describe("agentTimeoutMs", () => {
  it("gives deep agents the long cap and standard agents the short cap", async () => {
    const { agentTimeoutMs } = await import("./ceo");
    expect(agentTimeoutMs("run_dcf_agent")).toBe(120_000); // deep
    expect(agentTimeoutMs("run_technical_agent")).toBe(60_000); // standard
    expect(agentTimeoutMs("run_macro_agent")).toBe(120_000); // explicit override
  });
});

describe("withTimeout", () => {
  it("resolves a fast promise", async () => {
    const { withTimeout } = await import("./ceo");
    await expect(withTimeout(Promise.resolve("ok"), 1000, "x")).resolves.toBe("ok");
  });
  it("rejects with a labeled timeout when the promise is too slow", async () => {
    const { withTimeout } = await import("./ceo");
    await expect(withTimeout(new Promise(() => {}), 5, "slowAgent")).rejects.toThrow(
      /slowAgent timed out/,
    );
  });
});

describe("agentDispatch", () => {
  it("maps every crew tool name to a handler function", async () => {
    const { agentDispatch } = await import("./ceo");
    for (const name of ["run_risk_agent", "run_news_agent", "run_dcf_agent", "run_fundamentals_agent"]) {
      expect(agentDispatch[name]).toBeTypeOf("function");
    }
  });
});

describe("runCeoAgent orchestration", () => {
  it("dispatches the requested crew, isolates a failing agent, and emits a final report", async () => {
    finalMessages.push(
      { stop_reason: "tool_use", content: [toolUse("t1", "run_risk_agent"), toolUse("t2", "run_news_agent")], usage: {} },
      { stop_reason: "end_turn", content: [text("Final report body")], usage: {} },
    );
    const { runCeoAgent } = await import("./ceo");
    const events: AgentEvent[] = [];
    await runCeoAgent("analyze AAPL", "", (e) => events.push(e));

    const types = events.map((e) => e.type);
    expect(types).toContain("crew_planned");
    // Risk succeeded → agent_complete; news threw → agent_error (the others kept running).
    expect(events).toContainEqual(expect.objectContaining({ type: "agent_complete", agent: "run_risk_agent" }));
    expect(events).toContainEqual(expect.objectContaining({ type: "agent_error", agent: "run_news_agent" }));
    expect(runRiskAgent).toHaveBeenCalled();
    // Final report reaches the user.
    expect(events).toContainEqual(expect.objectContaining({ type: "final_response", content: expect.stringContaining("Final report body") }));
    expect(types[types.length - 1]).toBe("done");
  });

  it("short-circuits to the cached result without invoking the handler", async () => {
    checkCache.mockResolvedValue("CACHED RISK RESULT");
    finalMessages.push(
      { stop_reason: "tool_use", content: [toolUse("t1", "run_risk_agent")], usage: {} },
      { stop_reason: "end_turn", content: [text("done report")], usage: {} },
    );
    const { runCeoAgent } = await import("./ceo");
    const events: AgentEvent[] = [];
    await runCeoAgent("analyze AAPL", "", (e) => events.push(e));

    expect(runRiskAgent).not.toHaveBeenCalled(); // served from cache
    expect(events).toContainEqual(
      expect.objectContaining({ type: "agent_complete", agent: "run_risk_agent", result: "CACHED RISK RESULT" }),
    );
  });
});
