import { describe, it, expect } from "vitest";
import { contextFromPath, contextLabel, contextPill } from "./chatContext";

describe("contextFromPath", () => {
  it("maps page routes", () => {
    expect(contextFromPath("/research")).toBe("research");
    expect(contextFromPath("/watchlist")).toBe("watchlist");
    expect(contextFromPath("/portfolio")).toBe("portfolio");
  });
  it("maps a stock route to stock:<TICKER> uppercased", () => {
    expect(contextFromPath("/stock/aapl")).toBe("stock:AAPL");
    expect(contextFromPath("/stock/AAPL", "AAPL")).toBe("stock:AAPL");
  });
  it("returns null for unrelated routes", () => {
    expect(contextFromPath("/chat")).toBeNull();
    expect(contextFromPath("/settings")).toBeNull();
    expect(contextFromPath("/stock/")).toBeNull();
  });
});

describe("contextLabel", () => {
  it("uppercases page contexts", () => {
    expect(contextLabel("research")).toBe("RESEARCH");
    expect(contextLabel("portfolio")).toBe("PORTFOLIO");
  });
  it("strips the stock: prefix", () => {
    expect(contextLabel("stock:AAPL")).toBe("AAPL");
  });
  it("labels null as ALL", () => {
    expect(contextLabel(null)).toBe("ALL");
  });
});

describe("contextPill", () => {
  it("formats a stock context as '<TICKER> · Stock page'", () => {
    expect(contextPill("stock:AAPL")).toBe("AAPL · Stock page");
    expect(contextPill("stock:msft")).toBe("MSFT · Stock page");
  });
  it("labels the page contexts", () => {
    expect(contextPill("watchlist")).toBe("Watchlist");
    expect(contextPill("portfolio")).toBe("Portfolio");
    expect(contextPill("research")).toBe("Research");
  });
  it("returns null when there is no page context (main chat area)", () => {
    expect(contextPill(null)).toBeNull();
  });
  it("returns null for an empty stock ticker or unknown context", () => {
    expect(contextPill("stock:")).toBeNull();
    expect(contextPill("something-else")).toBeNull();
  });
});
