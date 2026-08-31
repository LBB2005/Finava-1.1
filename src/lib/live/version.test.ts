import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executionMode } from "./version";

const original = process.env.LIVE_TRADING_ENABLED;

beforeEach(() => {
  delete process.env.LIVE_TRADING_ENABLED;
});
afterEach(() => {
  if (original === undefined) delete process.env.LIVE_TRADING_ENABLED;
  else process.env.LIVE_TRADING_ENABLED = original;
});

describe("executionMode", () => {
  it("defaults to shadow when the flag is unset", () => {
    // The default must be the mode that cannot place an order, so a missing env
    // var during a deploy degrades to recording rather than trading.
    expect(executionMode()).toBe("shadow");
  });

  it("only enables paper on an exact 'true'", () => {
    process.env.LIVE_TRADING_ENABLED = "true";
    expect(executionMode()).toBe("paper");
  });

  it.each(["1", "yes", "TRUE", "on", ""])("stays shadow for %o", (v) => {
    process.env.LIVE_TRADING_ENABLED = v;
    expect(executionMode()).toBe("shadow");
  });

  it("never returns live — real capital gets its own module", () => {
    process.env.LIVE_TRADING_ENABLED = "live";
    expect(executionMode()).toBe("shadow");
  });
});
