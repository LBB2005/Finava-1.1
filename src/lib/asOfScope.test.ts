import { describe, it, expect } from "vitest";
import {
  withAsOfScope,
  currentAsOf,
  currentAsOfDayFilter,
  perplexityAsOfFilters,
} from "./asOfScope";

describe("as-of scope", () => {
  it("is empty outside a scoped run — an ordinary chat clips nothing", () => {
    expect(currentAsOf()).toBeNull();
    expect(currentAsOfDayFilter()).toBeNull();
  });

  it("exposes the cutoff inside the scope", async () => {
    await withAsOfScope("2026-09-02T13:15:00.000Z", async () => {
      expect(currentAsOf()).toBe("2026-09-02T13:15:00.000Z");
    });
  });

  it("does not leak out of the scope", async () => {
    await withAsOfScope("2026-09-02T13:15:00.000Z", async () => {});
    expect(currentAsOf()).toBeNull();
  });

  it("survives an await boundary, which is the whole reason it is ambient", async () => {
    await withAsOfScope("2026-09-02T13:15:00.000Z", async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(currentAsOf()).toBe("2026-09-02T13:15:00.000Z");
    });
  });

  it("isolates concurrent runs from each other", async () => {
    const seen: string[] = [];
    await Promise.all([
      withAsOfScope("2026-01-01T00:00:00.000Z", async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(currentAsOf()!);
      }),
      withAsOfScope("2026-06-01T00:00:00.000Z", async () => {
        seen.push(currentAsOf()!);
      }),
    ]);
    expect(seen.sort()).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
    ]);
  });

  it("nests, with the inner scope winning", async () => {
    await withAsOfScope("2026-01-01T00:00:00.000Z", async () => {
      await withAsOfScope("2026-06-01T00:00:00.000Z", async () => {
        expect(currentAsOf()).toBe("2026-06-01T00:00:00.000Z");
      });
      expect(currentAsOf()).toBe("2026-01-01T00:00:00.000Z");
    });
  });
});

describe("currentAsOfDayFilter", () => {
  it("renders Perplexity's MM/DD/YYYY, zero-padded", async () => {
    await withAsOfScope("2026-09-02T13:15:00.000Z", async () => {
      expect(currentAsOfDayFilter()).toBe("09/02/2026");
    });
  });

  it("keeps the as-of's OWN day, so the morning's news is not withheld", async () => {
    // Day-granular filters mean excluding the current day would blind a pre-open
    // run to everything published that morning — most of what it is for.
    await withAsOfScope("2026-09-02T13:15:00.000Z", async () => {
      expect(currentAsOfDayFilter()).toBe("09/02/2026");
    });
  });

  it("pads single-digit months and days", async () => {
    await withAsOfScope("2026-01-05T00:00:00.000Z", async () => {
      expect(currentAsOfDayFilter()).toBe("01/05/2026");
    });
  });

  it("reads the day in UTC, not the host's timezone", async () => {
    // 23:30Z on the 2nd is still the 2nd, whatever the runner's local clock says.
    await withAsOfScope("2026-09-02T23:30:00.000Z", async () => {
      expect(currentAsOfDayFilter()).toBe("09/02/2026");
    });
  });

  it("returns null for an unreadable cutoff rather than an invalid filter", async () => {
    // A malformed filter would be ignored by Perplexity and fail open silently;
    // null at least means the caller sends no filter for a reason it can see.
    await withAsOfScope("not a date", async () => {
      expect(currentAsOfDayFilter()).toBeNull();
    });
  });
});

describe("perplexityAsOfFilters", () => {
  it("is empty outside a scoped run, so ordinary searches are unrestricted", () => {
    expect(perplexityAsOfFilters()).toEqual({});
  });

  it("bounds publication AND revision", async () => {
    await withAsOfScope("2026-06-11T13:15:00.000Z", async () => {
      expect(perplexityAsOfFilters()).toEqual({
        search_before_date_filter: "06/11/2026",
        last_updated_before_filter: "06/11/2026",
      });
    });
  });

  it("is empty when the cutoff is unreadable rather than sending a bad filter", async () => {
    await withAsOfScope("nonsense", async () => {
      expect(perplexityAsOfFilters()).toEqual({});
    });
  });
});
