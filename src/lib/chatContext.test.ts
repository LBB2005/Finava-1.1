import { describe, it, expect } from "vitest";
import { contextFromPath, contextLabel } from "./chatContext";

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
