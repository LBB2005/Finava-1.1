import { describe, it, expect } from "vitest";
import { agentTools, scoutTool, allTools, AGENT_COUNT } from "./index";

// The canonical crew. This list is the contract between the tool registry
// (what the model is offered) and the CEO dispatch map (what actually runs).
// ceo.test.ts asserts `agentDispatch` has exactly these keys; if the two drift
// — e.g. a tool is added here without a handler — one of the two suites fails.
const EXPECTED_CREW = [
  "run_risk_agent",
  "run_news_agent",
  "run_macro_agent",
  "run_technical_agent",
  "run_dcf_agent",
  "run_earnings_agent",
  "run_insider_agent",
  "run_sentiment_agent",
  "run_competitor_agent",
  "run_options_agent",
  "run_comparables_agent",
  "run_graham_agent",
  "run_analyst_agent",
  "run_hype_agent",
  "run_fundamentals_agent",
];

describe("agent tool registry", () => {
  it("exposes exactly the canonical crew, with no duplicates", () => {
    const names = agentTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length); // unique
    expect(names.sort()).toEqual([...EXPECTED_CREW].sort());
  });

  it("keeps AGENT_COUNT in sync with the crew (drives the 'N-agent system' UI)", () => {
    expect(AGENT_COUNT).toBe(agentTools.length);
    expect(AGENT_COUNT).toBe(EXPECTED_CREW.length);
  });

  it("gives every tool a description and a well-formed input schema", () => {
    for (const tool of agentTools) {
      expect(tool.description, `${tool.name} description`).toBeTruthy();
      expect(tool.input_schema.type).toBe("object");
      const props = Object.keys(tool.input_schema.properties ?? {});
      // Every required field must actually be declared as a property.
      for (const req of tool.input_schema.required ?? []) {
        expect(props, `${tool.name} required '${req}'`).toContain(req);
      }
    }
  });

  it("treats the scout as orchestration, not a crew member", () => {
    // The scout scans the universe; it must NOT inflate the crew count or the UI.
    expect(agentTools.map((t) => t.name)).not.toContain("scout_universe");
    expect(scoutTool.name).toBe("scout_universe");
    // Discovery scout requires a query + tier so the CEO can't call it half-formed.
    expect(scoutTool.input_schema.required).toEqual(["query", "tier"]);
    const tier = (scoutTool.input_schema.properties as Record<string, { enum?: string[] }> | undefined)?.tier;
    expect(tier?.enum).toEqual(["quick", "deep"]);
  });

  it("hands the model the crew plus the scout via allTools", () => {
    expect(allTools).toHaveLength(agentTools.length + 1);
    expect(allTools.map((t) => t.name)).toContain("scout_universe");
    // allTools is the union: every crew tool is present too.
    for (const name of EXPECTED_CREW) {
      expect(allTools.map((t) => t.name)).toContain(name);
    }
  });
});

export { EXPECTED_CREW };
