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

  // An inbound `x-request-id` is attacker-supplied. It reaches the logger and
  // the Langfuse sessionId, so it is accepted only in the shape a correlation id
  // actually takes; anything else is replaced rather than rejected, because a
  // hostile header must not be able to fail a request.
  describe("requestId sanitisation", () => {
    const generated = /^[0-9a-f]{8}$/;

    it("accepts the correlation-id shapes callers really send", () => {
      for (const id of [
        "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        "iad1::abcde-1712345678901-0a1b2c3d4e5f",
        "req_ABC.123-x",
        "a".repeat(64),
      ]) {
        expect(makeRunContext("u", id).requestId).toBe(id);
      }
    });

    it("replaces an id carrying control characters or newlines", () => {
      for (const id of ["req\nInjected", "req\r\nX", "req\u0000null", "req\u001b[31m"]) {
        expect(makeRunContext("u", id).requestId).toMatch(generated);
      }
    });

    it("replaces an id carrying characters outside the correlation-id set", () => {
      for (const id of ["req id", "<script>", "req/../../etc", "req\"quote", "π"]) {
        expect(makeRunContext("u", id).requestId).toMatch(generated);
      }
    });

    it("replaces an over-long id rather than truncating it", () => {
      // Truncating would silently collide two distinct upstream ids under one
      // correlation key; generating a fresh one keeps runs distinguishable.
      expect(makeRunContext("u", "a".repeat(65)).requestId).toMatch(generated);
    });

    it("replaces an empty id", () => {
      expect(makeRunContext("u", "").requestId).toMatch(generated);
    });
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
