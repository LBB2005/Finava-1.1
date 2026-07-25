// Idle-timeout wrapper for a streaming model call.
//
// The CEO synthesis and revision passes stream 16–32K-token reports, which
// legitimately take minutes — so a *total*-duration timeout would truncate a
// healthy long report. What actually indicates a stuck call is silence: no token
// for a stretch. This wrapper aborts only when the stream goes quiet for `idleMs`,
// and forwards each token to `onText` so the same call can also stream to the UI.
//
// The stream type is structural (just the three methods we use) so this stays a
// pure, unit-testable helper with no Anthropic SDK dependency.

export interface AbortableTextStream<T> {
  on(event: "text", cb: (delta: string) => void): unknown;
  finalMessage(): Promise<T>;
  abort(): void;
}

/** Timer functions, injectable so tests can drive them deterministically. */
export interface TimerApi {
  set: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (handle: ReturnType<typeof setTimeout>) => void;
}

const defaultTimers: TimerApi = {
  set: (cb, ms) => setTimeout(cb, ms),
  clear: (h) => clearTimeout(h),
};

/**
 * Await `stream.finalMessage()`, aborting the stream if no text token arrives for
 * `idleMs`. Each token is forwarded to `onText` (the live-streaming hook) and
 * resets the idle window. Resolves with the final message; rejects if the stream
 * stalls (abort → finalMessage rejects) or errors.
 */
export function consumeWithIdleTimeout<T>(
  stream: AbortableTextStream<T>,
  idleMs: number,
  onText?: (delta: string) => void,
  timers: TimerApi = defaultTimers,
): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | null = null;

  const arm = () => {
    if (handle !== null) timers.clear(handle);
    handle = timers.set(() => stream.abort(), idleMs);
  };

  stream.on("text", (delta) => {
    onText?.(delta);
    arm();
  });

  arm();

  return stream.finalMessage().finally(() => {
    if (handle !== null) {
      timers.clear(handle);
      handle = null;
    }
  });
}
