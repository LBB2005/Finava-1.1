import { describe, expect, it } from "vitest";
import {
  makeRunContext,
  newRequestId,
  currentRequestId,
  currentRunCredits,
  usageStore,
} from "./runContext";

describe("runContext", () => {
  it("makeRunContext sets userId, a requestId, and a zeroed credit accumulator", () => {
    const ctx = makeRunContext("user_1");
    expect(ctx.userId).toBe("user_1");
    expect(ctx.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(ctx.credits).toEqual({ total: 0 });
  });

  it("honors a supplied requestId", () => {
    expect(makeRunContext("u", "fixed-id").requestId).toBe("fixed-id");
  });

  it("newRequestId returns distinct short ids", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });

  it("reads the active store for requestId and running credits", () => {
    expect(currentRequestId()).toBeUndefined();
    expect(currentRunCredits()).toBe(0);

    usageStore.run(makeRunContext("u", "rid"), () => {
      expect(currentRequestId()).toBe("rid");
      usageStore.getStore()!.credits.total += 5;
      expect(currentRunCredits()).toBe(5);
    });
  });
});
