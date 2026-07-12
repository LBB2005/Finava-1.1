import { describe, expect, it } from "vitest";
import { usMarketStatus } from "./marketHours";

// All timestamps are UTC; the ET wall-clock each maps to is noted inline. The
// function must evaluate the session in America/New_York regardless of the host
// timezone, so these assertions pin the ET boundaries, not local ones.
describe("usMarketStatus", () => {
  it("is open during the regular weekday session", () => {
    expect(usMarketStatus(new Date("2026-07-13T14:00:00Z"))).toEqual({ open: true, label: "Open" }); // Mon 10:00 EDT
  });

  it("opens exactly at 09:30 ET and treats 09:29 as closed", () => {
    expect(usMarketStatus(new Date("2026-07-13T13:29:00Z")).open).toBe(false); // Mon 09:29 EDT
    expect(usMarketStatus(new Date("2026-07-13T13:30:00Z")).open).toBe(true); // Mon 09:30 EDT
  });

  it("closes exactly at 16:00 ET (15:59 still open, 16:00 closed)", () => {
    expect(usMarketStatus(new Date("2026-07-13T19:59:00Z")).open).toBe(true); // Mon 15:59 EDT
    expect(usMarketStatus(new Date("2026-07-13T20:00:00Z")).open).toBe(false); // Mon 16:00 EDT
  });

  it("is closed on weekends even during session hours", () => {
    expect(usMarketStatus(new Date("2026-07-11T15:00:00Z"))).toEqual({ open: false, label: "Closed" }); // Sat 11:00 EDT
    expect(usMarketStatus(new Date("2026-07-12T15:00:00Z")).open).toBe(false); // Sun 11:00 EDT
  });

  it("respects DST: the same UTC time is open in summer but not in winter", () => {
    // 13:30 UTC → 09:30 EDT (summer) = open; → 08:30 EST (winter) = closed.
    expect(usMarketStatus(new Date("2026-07-13T13:30:00Z")).open).toBe(true);
    expect(usMarketStatus(new Date("2026-01-12T13:30:00Z")).open).toBe(false);
    // And the winter session opens at 14:30 UTC (09:30 EST).
    expect(usMarketStatus(new Date("2026-01-12T14:30:00Z")).open).toBe(true);
  });
});
