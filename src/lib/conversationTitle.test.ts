import { beforeEach, describe, it, expect, vi } from "vitest";

// conversationTitle imports firebase-admin (which self-initializes from env) and
// llm, so both are stubbed at the boundary.
const deps = vi.hoisted(() => {
  const convs = new Map<string, Record<string, unknown> | null>();
  const messages = new Map<string, { role?: string; content?: string }[]>();
  return {
    convs,
    messages,
    generate: vi.fn(),
    updateSpy: vi.fn(),
    paths: [] as string[],
    convRef: (uid: string, convId: string) => {
      const key = `${uid}/${convId}`;
      deps.paths.push(key);
      return {
        get: async () => {
          const data = convs.get(key);
          if (data === undefined) throw new Error("BOOM: conversation read failed");
          return { exists: data !== null, data: () => data ?? undefined };
        },
        collection: () => ({
          orderBy: () => ({
            get: async () => ({
              docs: (messages.get(key) ?? []).map((m) => ({ data: () => m })),
            }),
          }),
        }),
        update: deps.updateSpy,
      };
    },
  };
});

vi.mock("./firebase-admin", () => ({
  db: {
    collection: () => ({
      doc: (uid: string) => ({
        collection: () => ({ doc: (convId: string) => deps.convRef(uid, convId) }),
      }),
    }),
  },
}));
vi.mock("./llm", () => ({ generate: deps.generate }));

import { generateConversationTitle, sanitizeTitle } from "./conversationTitle";

describe("sanitizeTitle", () => {
  it("passes a clean title through unchanged", () => {
    expect(sanitizeTitle("Apple Stock Buy Analysis")).toBe("Apple Stock Buy Analysis");
  });

  it("strips wrapping straight and curly quotes/backticks", () => {
    expect(sanitizeTitle('"Apple Stock Analysis"')).toBe("Apple Stock Analysis");
    expect(sanitizeTitle("`Apple Stock Analysis`")).toBe("Apple Stock Analysis");
    expect(sanitizeTitle("“Apple Stock Analysis”")).toBe("Apple Stock Analysis");
  });

  it("removes a leading Title:/Chat: prefix", () => {
    expect(sanitizeTitle("Title: Apple Stock Analysis")).toBe("Apple Stock Analysis");
    expect(sanitizeTitle("Conversation - Apple Stock Analysis")).toBe(
      "Apple Stock Analysis"
    );
  });

  it("drops trailing punctuation", () => {
    expect(sanitizeTitle("Apple Stock Analysis.")).toBe("Apple Stock Analysis");
    expect(sanitizeTitle("Is Apple A Buy?")).toBe("Is Apple A Buy");
  });

  it("collapses internal whitespace and newlines", () => {
    expect(sanitizeTitle("Apple   Stock\nAnalysis")).toBe("Apple Stock Analysis");
  });

  it("clamps overly long titles on a word boundary", () => {
    const long = "Apple Stock Comprehensive Long Term Investment Thesis And Valuation Review Deep";
    const out = sanitizeTitle(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).not.toMatch(/\s$/);
    // No partial word at the end.
    expect(long.startsWith(out)).toBe(true);
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(sanitizeTitle("")).toBe("");
    expect(sanitizeTitle("   ")).toBe("");
    expect(sanitizeTitle('""')).toBe("");
  });
});

describe("generateConversationTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deps.convs.clear();
    deps.messages.clear();
    deps.paths.length = 0;
    deps.generate.mockResolvedValue("Apple Stock Analysis");
    deps.updateSpy.mockResolvedValue(undefined);
    deps.convs.set("u1/c1", { title: "" });
    deps.messages.set("u1/c1", [
      { role: "user", content: "Is AAPL a buy?" },
      { role: "assistant", content: "Here is the case." },
    ]);
  });

  it("titles a conversation once the first exchange exists", async () => {
    await generateConversationTitle("u1", "c1");
    expect(deps.updateSpy).toHaveBeenCalledWith({ title: "Apple Stock Analysis" });
  });

  it("sanitizes the model's response before persisting", async () => {
    deps.generate.mockResolvedValueOnce('  Title: Apple Stock Analysis.  ');
    await generateConversationTitle("u1", "c1");
    expect(deps.updateSpy).toHaveBeenCalledWith({ title: "Apple Stock Analysis" });
  });

  it("keeps a QUOTED 'Title:' prefix — the prefix strip runs before the unquote", async () => {
    // Documents the ordering in sanitizeTitle: the ^-anchored prefix regex misses
    // the label when a quote precedes it, so only the quotes and full stop go.
    deps.generate.mockResolvedValueOnce('  "Title: Apple Stock Analysis."  ');
    await generateConversationTitle("u1", "c1");
    expect(deps.updateSpy).toHaveBeenCalledWith({ title: "Title: Apple Stock Analysis" });
  });

  it("does not meter the call against the user's credits", async () => {
    await generateConversationTitle("u1", "c1");
    expect(deps.generate).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "titleConversation", meter: false, maxTokens: 24 }),
    );
  });

  it("feeds the model both sides of the first exchange", async () => {
    await generateConversationTitle("u1", "c1");
    const { prompt } = deps.generate.mock.calls[0][0];
    expect(prompt).toContain("User asked:\nIs AAPL a buy?");
    expect(prompt).toContain("Assistant replied:\nHere is the case.");
  });

  it("truncates long messages before sending them", async () => {
    deps.messages.set("u1/c1", [
      { role: "user", content: "u".repeat(900) },
      { role: "assistant", content: "a".repeat(900) },
    ]);
    await generateConversationTitle("u1", "c1");
    const { prompt } = deps.generate.mock.calls[0][0];
    expect(prompt).not.toContain("u".repeat(501));
    expect(prompt).not.toContain("a".repeat(501));
  });

  it("uses the FIRST user and assistant messages, ignoring later turns", async () => {
    deps.messages.set("u1/c1", [
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second question" },
    ]);
    await generateConversationTitle("u1", "c1");
    const { prompt } = deps.generate.mock.calls[0][0];
    expect(prompt).toContain("first question");
    expect(prompt).not.toContain("second question");
  });

  it("reads only the caller's own conversation", async () => {
    await generateConversationTitle("u1", "c1");
    expect(deps.paths).toEqual(["u1/c1"]);
  });

  it("no-ops when the conversation does not exist", async () => {
    deps.convs.set("u1/c1", null);
    await generateConversationTitle("u1", "c1");
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.updateSpy).not.toHaveBeenCalled();
  });

  it("leaves a manual rename or prior auto-title alone", async () => {
    deps.convs.set("u1/c1", { title: "My own name" });
    await generateConversationTitle("u1", "c1");
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only title as absent", async () => {
    deps.convs.set("u1/c1", { title: "   " });
    await generateConversationTitle("u1", "c1");
    expect(deps.updateSpy).toHaveBeenCalled();
  });

  it("waits for a complete exchange before titling", async () => {
    deps.messages.set("u1/c1", [{ role: "user", content: "Is AAPL a buy?" }]);
    await generateConversationTitle("u1", "c1");
    expect(deps.generate).not.toHaveBeenCalled();

    deps.messages.set("u1/c1", []);
    await generateConversationTitle("u1", "c1");
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("skips messages with no content", async () => {
    deps.messages.set("u1/c1", [
      { role: "user", content: "" },
      { role: "assistant", content: "answer" },
    ]);
    await generateConversationTitle("u1", "c1");
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("leaves the raw-prompt fallback in place when the model returns nothing usable", async () => {
    deps.generate.mockResolvedValueOnce('  ""  ');
    await generateConversationTitle("u1", "c1");
    expect(deps.updateSpy).not.toHaveBeenCalled();
  });

  it("swallows a model failure — titling must never break a chat", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.generate.mockRejectedValueOnce(new Error("anthropic 529"));
    await expect(generateConversationTitle("u1", "c1")).resolves.toBeUndefined();
    expect(deps.updateSpy).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("swallows a Firestore failure", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.convs.delete("u1/c1"); // the stub throws for an unseeded path
    await expect(generateConversationTitle("u1", "c1")).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("swallows a failed write", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.updateSpy.mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(generateConversationTitle("u1", "c1")).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
