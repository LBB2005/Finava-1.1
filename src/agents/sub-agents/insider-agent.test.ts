import { describe, it, expect, vi, beforeEach } from "vitest";

const generate = vi.fn(async () => "INSIDER ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getInsiderTransactions = vi.fn();
vi.mock("@/lib/finnhub", () => ({ getInsiderTransactions: (...a: unknown[]) => getInsiderTransactions(...a) }));

const searchRecentForm4 = vi.fn();
vi.mock("@/lib/edgar", () => ({ searchRecentForm4: (...a: unknown[]) => searchRecentForm4(...a) }));

const lastPrompt = () => (generate.mock.calls.at(-1)![0] as { prompt: string }).prompt;

beforeEach(() => {
  generate.mockClear().mockResolvedValue("INSIDER ANALYSIS");
  searchRecentForm4.mockReset().mockResolvedValue([]); // no Form 4 filings → no fetch needed
  getInsiderTransactions.mockReset().mockResolvedValue({ data: [] });
});

describe("runInsiderAgent", () => {
  it("reports no qualifying purchases and folds in Finnhub history", async () => {
    getInsiderTransactions.mockResolvedValue({
      data: [
        { name: "Jane CEO", change: 1000, transactionPrice: 50, transactionCode: "P", transactionDate: "2026-05-01", share: 1000 },
        { name: "Bob CFO", change: -500, transactionPrice: 60, transactionCode: "S", transactionDate: "2026-05-02", share: 500 },
      ],
    });
    const { runInsiderAgent } = await import("./insider-agent");
    const out = await runInsiderAgent({ tickers: ["AAPL"] });
    expect(out).toBe("INSIDER ANALYSIS");
    const p = lastPrompt();
    expect(p).toContain("No qualifying insider purchases");
    expect(p).toContain("FINNHUB");
    expect(p).toContain("AAPL");
  });

  it("flags EDGAR as UNAVAILABLE (not empty) when every lookup fails", async () => {
    searchRecentForm4.mockRejectedValue(new Error("SEC unreachable"));
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL", "MSFT"] });
    const p = lastPrompt();
    expect(p).toContain("UNAVAILABLE");
    expect(p).toContain("do not treat this as an absence of purchases");
  });

  it("degrades gracefully when Finnhub insider data errors", async () => {
    getInsiderTransactions.mockRejectedValue(new Error("rate limited"));
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL"] });
    expect(lastPrompt()).toContain("Could not fetch Finnhub insider data");
    expect(generate).toHaveBeenCalled(); // still synthesizes
  });
});
