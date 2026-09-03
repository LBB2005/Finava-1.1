import { describe, expect, it } from "vitest";
import { seedRng } from "./portfolioMock";

describe("seedRng", () => {
  it("is deterministic for the same seed", () => {
    const a = seedRng("AAPL");
    const b = seedRng("AAPL");
    const seqA = Array.from({ length: 20 }, a);
    const seqB = Array.from({ length: 20 }, b);
    expect(seqA).toEqual(seqB);
  });

  it("gives different streams for different seeds", () => {
    const a = Array.from({ length: 20 }, seedRng("AAPL"));
    const b = Array.from({ length: 20 }, seedRng("MSFT"));
    expect(a).not.toEqual(b);
  });

  it("stays in [0, 1)", () => {
    const rng = seedRng("portfolio");
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("advances — successive draws are not all identical", () => {
    const rng = seedRng("x");
    const draws = new Set(Array.from({ length: 50 }, rng));
    expect(draws.size).toBeGreaterThan(1);
  });

  it("handles the empty seed without throwing", () => {
    const rng = seedRng("");
    expect(rng()).toBeGreaterThanOrEqual(0);
    expect(rng()).toBeLessThan(1);
  });
});
