import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  prefExists: true,
  prefData: {} as Record<string, unknown>,
  prefGet: vi.fn(),
  prefSet: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return {
        doc: vi.fn(() => ({
          collection: vi.fn((sub: string) => {
            if (sub !== "preferences") throw new Error(`unexpected subcollection ${sub}`);
            return {
              doc: vi.fn((id: string) => ({
                id,
                get: deps.prefGet,
                set: deps.prefSet,
              })),
            };
          }),
        })),
      };
    }),
  },
}));

import {
  STYLE_SECTION_ORDER,
  buildStylePrompt,
  getUserPreference,
  saveUserPreference,
  updateStyleFromConversation,
  type InvestingStyle,
} from "./userPreference";

const defaultStyle: InvestingStyle = {
  horizon: "unknown",
  riskTolerance: "unknown",
  style: "unknown",
  sectors: [],
  priorities: [],
  confidence: 0,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  vi.clearAllMocks();
  deps.prefExists = true;
  deps.prefData = {
    style: JSON.stringify({
      horizon: "long_term",
      riskTolerance: "moderate",
      style: "value",
      sectors: ["tech"],
      priorities: ["valuation"],
      confidence: 0.45,
    }),
  };
  deps.prefGet.mockImplementation(async () => ({
    exists: deps.prefExists,
    data: () => deps.prefData,
  }));
  deps.prefSet.mockResolvedValue(undefined);
});

describe("user preference persistence", () => {
  it("loads saved investing style JSON and falls back on missing or malformed data", async () => {
    await expect(getUserPreference("user_123")).resolves.toMatchObject({
      horizon: "long_term",
      riskTolerance: "moderate",
      style: "value",
      sectors: ["tech"],
      priorities: ["valuation"],
      confidence: 0.45,
    });

    deps.prefExists = false;
    await expect(getUserPreference("user_123")).resolves.toEqual(defaultStyle);

    deps.prefExists = true;
    deps.prefData = {};
    await expect(getUserPreference("user_123")).resolves.toEqual(defaultStyle);

    deps.prefGet.mockRejectedValueOnce(new Error("firestore down"));
    await expect(getUserPreference("user_123")).resolves.toEqual(defaultStyle);
  });

  it("saves style profiles with an update timestamp and swallows write errors", async () => {
    const style: InvestingStyle = {
      horizon: "short_term",
      riskTolerance: "aggressive",
      style: "momentum",
      sectors: ["semis"],
      priorities: ["technicals"],
      confidence: 0.7,
    };

    await saveUserPreference("user_123", style);

    expect(deps.prefSet).toHaveBeenCalledWith({
      style: JSON.stringify(style),
      updatedAt: "2026-06-15T12:00:00.000Z",
    });

    deps.prefSet.mockRejectedValueOnce(new Error("write failed"));
    await expect(saveUserPreference("user_123", style)).resolves.toBeUndefined();
  });
});

describe("updateStyleFromConversation", () => {
  it("extracts, merges, caps, and saves inferred style", async () => {
    const anthropicClient = {
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                horizon: "unknown",
                riskTolerance: "aggressive",
                style: "growth",
                sectors: ["ai", "tech", "healthcare", "energy", "financials", "industrials", "extra"],
                priorities: ["revenue growth", "TAM"],
                confidence: 0.99,
              }),
            },
          ],
        })),
      },
    };

    await updateStyleFromConversation(
      "user_123",
      "Long-term but I care about revenue growth and TAM",
      "The report discussed DCF and revenue growth",
      anthropicClient as never
    );

    expect(anthropicClient.messages.create).toHaveBeenCalledWith({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Existing profile"),
      })],
    });
    const saved = JSON.parse(deps.prefSet.mock.calls[0][0].style);
    expect(saved).toEqual({
      horizon: "long_term",
      riskTolerance: "aggressive",
      style: "growth",
      sectors: ["tech", "ai", "healthcare", "energy", "financials", "industrials"],
      priorities: ["revenue growth", "TAM"],
      confidence: 0.95,
    });
  });

  it("does nothing when Haiku returns no JSON and swallows extraction failures", async () => {
    const anthropicClient = {
      messages: {
        create: vi.fn(async () => ({ content: [{ type: "text", text: "no json" }] })),
      },
    };

    await updateStyleFromConversation("user_123", "query", "response", anthropicClient as never);
    expect(deps.prefSet).not.toHaveBeenCalled();

    anthropicClient.messages.create.mockRejectedValueOnce(new Error("down"));
    await expect(updateStyleFromConversation("user_123", "query", "response", anthropicClient as never))
      .resolves.toBeUndefined();
  });
});

describe("buildStylePrompt", () => {
  it("omits low-confidence or unknown profiles", () => {
    expect(buildStylePrompt({ ...defaultStyle, confidence: 0.29, style: "value" })).toBe("");
    expect(buildStylePrompt({ ...defaultStyle, confidence: 0.8, style: "unknown" })).toBe("");
  });

  it("builds an ordered CEO prompt for known profiles", () => {
    const prompt = buildStylePrompt({
      horizon: "short_term",
      riskTolerance: "conservative",
      style: "momentum",
      sectors: ["semis", "software"],
      priorities: ["technicals", "sentiment"],
      confidence: 0.62,
    });

    expect(prompt).toContain("## User Investing Profile (confidence: 62%)");
    expect(prompt).toContain("- **Style**: momentum");
    expect(prompt).toContain("- **Horizon**: short-term");
    expect(prompt).toContain("- **Risk tolerance**: conservative");
    expect(prompt).toContain("- **Preferred sectors**: semis, software");
    expect(prompt).toContain("- **Priorities**: technicals, sentiment");
    expect(prompt).toContain(STYLE_SECTION_ORDER.momentum.slice(0, 6).join(" → "));
  });
});
