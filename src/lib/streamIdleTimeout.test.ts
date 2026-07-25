import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeWithIdleTimeout, type AbortableTextStream } from "./streamIdleTimeout";

/**
 * Minimal stand-in for the Anthropic SDK's MessageStream: emits `text` deltas,
 * resolves/rejects a `finalMessage()` promise, and records `abort()`.
 */
class FakeStream<T> implements AbortableTextStream<T> {
  private handlers: ((d: string) => void)[] = [];
  private resolveFinal!: (v: T) => void;
  private rejectFinal!: (e: Error) => void;
  aborted = false;
  private final = new Promise<T>((res, rej) => {
    this.resolveFinal = res;
    this.rejectFinal = rej;
  });
  on(event: "text", cb: (d: string) => void): this {
    if (event === "text") this.handlers.push(cb);
    return this;
  }
  finalMessage(): Promise<T> {
    return this.final;
  }
  abort(): void {
    this.aborted = true;
    this.rejectFinal(new Error("Request was aborted."));
  }
  emitText(d: string) {
    this.handlers.forEach((h) => h(d));
  }
  complete(v: T) {
    this.resolveFinal(v);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("consumeWithIdleTimeout", () => {
  it("resolves with the final message when it completes before going idle", async () => {
    const stream = new FakeStream<{ id: number }>();
    const p = consumeWithIdleTimeout(stream, 1000);
    stream.emitText("hello");
    vi.advanceTimersByTime(500);
    stream.complete({ id: 7 });
    await expect(p).resolves.toEqual({ id: 7 });
    expect(stream.aborted).toBe(false);
  });

  it("forwards each text delta to onText (this is the live-streaming hook)", async () => {
    const stream = new FakeStream<{ id: number }>();
    const seen: string[] = [];
    const p = consumeWithIdleTimeout(stream, 1000, (d) => seen.push(d));
    stream.emitText("The ");
    stream.emitText("thesis");
    stream.complete({ id: 1 });
    await p;
    expect(seen).toEqual(["The ", "thesis"]);
  });

  it("aborts the stream when no token arrives within idleMs", async () => {
    const stream = new FakeStream<{ id: number }>();
    const p = consumeWithIdleTimeout(stream, 1000);
    vi.advanceTimersByTime(1000);
    await expect(p).rejects.toThrow(/abort/i);
    expect(stream.aborted).toBe(true);
  });

  it("does not abort a slow-but-steady stream — each delta resets the idle window", async () => {
    const stream = new FakeStream<{ id: number }>();
    const p = consumeWithIdleTimeout(stream, 1000);
    // Three quiet-but-under-threshold gaps, each punctuated by a token.
    vi.advanceTimersByTime(900);
    stream.emitText("a");
    vi.advanceTimersByTime(900);
    stream.emitText("b");
    vi.advanceTimersByTime(900);
    stream.complete({ id: 42 });
    await expect(p).resolves.toEqual({ id: 42 });
    expect(stream.aborted).toBe(false);
  });
});
