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

// generate() backs both the skeptic critique and the follow-up questions. Each
// test sets these; by default both are empty, so the revision pass short-circuits
// (keeps the draft) and no follow-ups emit — matching the original behaviour.
let skepticCritique = "";
let followupsRaw = "";
const generate = vi.fn(async (opts: { agent?: string }) => {
  if (opts?.agent === "skeptic") return skepticCritique;
  if (opts?.agent === "chatFollowups") return followupsRaw;
  return "";
});
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o as { agent?: string }), AGENT_MODELS: {} }));
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
const runScoutAgent = vi.fn(async () => "scout picks");
vi.mock("./sub-agents/scout-agent", () => ({ runScoutAgent: (...a: unknown[]) => runScoutAgent(...(a as [])) }));

const toolUse = (id: string, name: string) => ({ type: "tool_use", id, name, input: {} });
const text = (t: string) => ({ type: "text", text: t });

beforeEach(() => {
  finalMessages.length = 0;
  skepticCritique = "";
  followupsRaw = "";
  streamSpy.mockReset().mockImplementation(() => ({
    finalMessage: () => Promise.resolve(finalMessages.shift()),
  }));
  generate.mockClear();
  checkCache.mockReset().mockResolvedValue(null);
  runRiskAgent.mockClear();
  runNewsAgent.mockClear();
  runScoutAgent.mockClear();
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

  it("runs the skeptic→revision pass and ships the REVISED report, not the draft", async () => {
    skepticCritique = "**Skeptic Review:** the beta claim is unsourced.";
    finalMessages.push(
      { stop_reason: "tool_use", content: [toolUse("t1", "run_risk_agent")], usage: {} },
      { stop_reason: "end_turn", content: [text("DRAFT report body")], usage: {} },
      // The revision pass makes a second stream() call — this is its output.
      { stop_reason: "end_turn", content: [text("REVISED report body")], usage: {} },
    );
    const { runCeoAgent } = await import("./ceo");
    const events: AgentEvent[] = [];
    await runCeoAgent("analyze AAPL", "", (e) => events.push(e));

    const types = events.map((e) => e.type);
    // Skeptic critique is surfaced for transparency…
    expect(types).toContain("skeptic_start");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "skeptic_complete", critique: expect.stringContaining("Skeptic Review") }),
    );
    // …but the user reads the corrected report, and the draft is gone.
    const final = events.find((e) => e.type === "final_response") as { content: string };
    expect(final.content).toContain("REVISED report body");
    expect(final.content).not.toContain("DRAFT report body");
  });

  it("keeps the draft when the skeptic finds nothing (revision short-circuits)", async () => {
    // Default: skepticCritique is empty → the revision stream() is never called,
    // so only the two scripted messages are consumed.
    finalMessages.push(
      { stop_reason: "tool_use", content: [toolUse("t1", "run_risk_agent")], usage: {} },
      { stop_reason: "end_turn", content: [text("DRAFT stands")], usage: {} },
    );
    const { runCeoAgent } = await import("./ceo");
    const events: AgentEvent[] = [];
    await runCeoAgent("analyze AAPL", "", (e) => events.push(e));

    const final = events.find((e) => e.type === "final_response") as { content: string };
    expect(final.content).toContain("DRAFT stands");
    // stream() called exactly twice (loop turn + draft turn), never a 3rd revision turn.
    expect(streamSpy).toHaveBeenCalledTimes(2);
  });

  it("in discover mode calls only the scout and never announces a crew", async () => {
    finalMessages.push(
      { stop_reason: "tool_use", content: [toolUse("s1", "scout_universe")], usage: {} },
      { stop_reason: "end_turn", content: [text("Here are 5 energy names…")], usage: {} },
    );
    const { runCeoAgent } = await import("./ceo");
    const events: AgentEvent[] = [];
    await runCeoAgent("find me cheap energy names", "PORTFOLIO", (e) => events.push(e), {
      discover: true,
      tier: "quick",
    });

    expect(runScoutAgent).toHaveBeenCalledTimes(1);
    // The scout is orchestration, not a crew member — no crew panel, no agent rows.
    const types = events.map((e) => e.type);
    expect(types).not.toContain("crew_planned");
    expect(types).not.toContain("agent_start");
    // Discovery bypasses agentOutputs, so the skeptic pass stays off (kept instant).
    expect(types).not.toContain("skeptic_start");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "final_response", content: expect.stringContaining("energy names") }),
    );
  });

  it("emits up to 3 follow-up questions parsed from the model's JSON", async () => {
    followupsRaw = 'Some preamble ["What are the risks?", "How does it compare?", "Q3", "Q4 extra"] trailing';
    finalMessages.push({ stop_reason: "end_turn", content: [text("report")], usage: {} });
    const { runCeoAgent } = await import("./ceo");
    const events: AgentEvent[] = [];
    await runCeoAgent("analyze AAPL", "", (e) => events.push(e));

    const followups = events.find((e) => e.type === "followups") as { questions: string[] };
    expect(followups).toBeTruthy();
    expect(followups.questions).toEqual(["What are the risks?", "How does it compare?", "Q3"]); // capped at 3
  });

  it("does not emit follow-ups when the model returns unparseable text", async () => {
    followupsRaw = "sorry, I can't do that";
    finalMessages.push({ stop_reason: "end_turn", content: [text("report")], usage: {} });
    const { runCeoAgent } = await import("./ceo");
    const events: AgentEvent[] = [];
    await runCeoAgent("analyze AAPL", "", (e) => events.push(e));

    expect(events.map((e) => e.type)).not.toContain("followups");
    expect(events.map((e) => e.type).at(-1)).toBe("done");
  });

  it("appends a length-limit warning when the draft is truncated at max_tokens", async () => {
    // A max_tokens draft with no tool calls → no revision → warning appended directly.
    finalMessages.push({ stop_reason: "max_tokens", content: [text("A very long report cut off")], usage: {} });
    const { runCeoAgent } = await import("./ceo");
    const events: AgentEvent[] = [];
    await runCeoAgent("analyze AAPL", "", (e) => events.push(e));

    const final = events.find((e) => e.type === "final_response") as { content: string };
    expect(final.content).toContain("A very long report cut off");
    expect(final.content).toContain("reached the length limit");
  });

  it("emits a graceful fallback when the loop exhausts MAX_ITERATIONS still asking for tools", async () => {
    // The model never stops requesting tools — the loop caps at MAX_ITERATIONS (10)
    // and finalResponse stays empty, so the user must still get a real message.
    streamSpy.mockImplementation(() => ({
      finalMessage: async () => ({
        stop_reason: "tool_use",
        content: [toolUse("t", "run_risk_agent")],
        usage: {},
      }),
    }));
    const { runCeoAgent } = await import("./ceo");
    const events: AgentEvent[] = [];
    await runCeoAgent("analyze AAPL", "", (e) => events.push(e));

    expect(streamSpy).toHaveBeenCalledTimes(10); // MAX_ITERATIONS for non-deep
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "final_response",
        content: expect.stringContaining("ran out of analysis steps"),
      }),
    );
    expect(events.map((e) => e.type).at(-1)).toBe("done");
  });
});

describe("crew ↔ dispatch consistency", () => {
  // Mirrors src/agents/tools/index.test.ts. The registry offers these tools to the
  // model; agentDispatch must have a handler for exactly the same set — no more
  // (a handler with no tool is dead code), no fewer (a tool with no handler throws
  // "Unknown agent" at runtime). run_risk_agent is special-cased in the loop (it
  // gets holdings) but is still present in the map.
  const EXPECTED_CREW = [
    "run_risk_agent", "run_news_agent", "run_macro_agent", "run_technical_agent",
    "run_dcf_agent", "run_earnings_agent", "run_insider_agent", "run_sentiment_agent",
    "run_competitor_agent", "run_options_agent", "run_comparables_agent",
    "run_graham_agent", "run_analyst_agent", "run_hype_agent", "run_fundamentals_agent",
  ];

  it("dispatches exactly the canonical crew, each to a function", async () => {
    const { agentDispatch } = await import("./ceo");
    expect(Object.keys(agentDispatch).sort()).toEqual([...EXPECTED_CREW].sort());
    for (const name of EXPECTED_CREW) {
      expect(agentDispatch[name]).toBeTypeOf("function");
    }
  });
});
