import { describe, expect, it } from "vitest";
import { CreateStrategySchema, UpdateStrategySchema } from "@/lib/schemas/strategy";

describe("strategy schemas", () => {
  it("trims names, defaults optional fields, and normalizes ticker arrays", () => {
    expect(
      CreateStrategySchema.parse({
        name: "  My strategy  ",
        tickers: [" aapl ", "AAPL", "msft", ""],
      })
    ).toMatchObject({
      name: "My strategy",
      tag: "Draft",
      desc: "",
      tickers: ["AAPL", "MSFT"],
      config: {},
      research: "",
      sharpe: 0,
      cagr: 0,
      maxDD: 0,
      winRate: 0,
    });
  });

  it("rejects empty strategy patches", () => {
    expect(() => UpdateStrategySchema.parse({})).toThrow(/At least one field/);
  });
});
