import { describe, expect, it } from "vitest";
import { normalizeTickers, toWatchlist } from "./watchlist";

describe("watchlist helpers", () => {
  it("maps Firestore rows to the API watchlist shape", () => {
    expect(toWatchlist({
      id: "watch_1",
      name: "Core",
      tickers: ["AAPL", "MSFT"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-06-15T00:00:00Z",
    })).toEqual({
      id: "watch_1",
      name: "Core",
      tickers: ["AAPL", "MSFT"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-06-15T00:00:00Z",
    });

    expect(toWatchlist({ id: "watch_2", name: "Empty", tickers: null }).tickers).toEqual([]);
  });

  it("normalizes ticker inputs without reordering first occurrences", () => {
    expect(normalizeTickers([" aapl ", "MSFT", "", "aapl", 123, " nvda "])).toEqual([
      "AAPL",
      "MSFT",
      "NVDA",
    ]);
    expect(normalizeTickers("AAPL")).toEqual([]);
  });
});
