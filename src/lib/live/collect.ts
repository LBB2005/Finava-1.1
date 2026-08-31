// Run an SSE-shaped agent headlessly.
//
// The crew emits AgentEvents to a callback because it was written to stream to a
// browser. The harness has no browser, but it must call THE SAME functions a
// user's request calls — the moment it gets its own headless variant, the public
// track record stops being evidence about the product a user actually uses. So
// instead of forking the agents, this collects their events into an array.
//
// The transcript is the by-product that matters: it is what gets chunked into
// Firestore and published, and it exists only because nothing here filters the
// stream down to a summary.

import type { AgentEvent } from "@/types/chat";

export interface Collected {
  events: AgentEvent[];
  /** Convenience: the first event of a kind, which is how most steps read a result. */
  first<T extends AgentEvent["type"]>(type: T): Extract<AgentEvent, { type: T }> | null;
  all<T extends AgentEvent["type"]>(type: T): Extract<AgentEvent, { type: T }>[];
}

export function collector(): { emit: (e: AgentEvent) => void; collected: Collected } {
  const events: AgentEvent[] = [];
  const collected: Collected = {
    events,
    first(type) {
      return (events.find((e) => e.type === type) ?? null) as never;
    },
    all(type) {
      return events.filter((e) => e.type === type) as never;
    },
  };
  return { emit: (e: AgentEvent) => void events.push(e), collected };
}

/**
 * Render collected events as the transcript text that gets published.
 *
 * Everything the crew emitted, in order, with nothing dropped — a transcript
 * that has been tidied is not a transcript. Text-bearing events render their
 * text; the rest render as their JSON so a reader can still see that they
 * happened and in what order.
 */
export function renderTranscript(events: AgentEvent[]): string {
  return events
    .map((e) => {
      const body = "content" in e && typeof e.content === "string"
        ? e.content
        : "text" in e && typeof e.text === "string"
          ? e.text
          : JSON.stringify(e);
      return `[${e.type}] ${body}`;
    })
    .join("\n\n");
}

/**
 * The crew's FINAL written report, if it produced one.
 *
 * Distinct from the transcript on purpose. The transcript is every event in
 * order — including each sub-agent's raw output — and is what gets published,
 * because a record of the conclusions without the reasoning is unfalsifiable.
 * But it is the wrong input to a structured-extraction call: it can run to
 * megabytes, and the answer being extracted is in the final report anyway.
 * Sending the whole stream cost an 8-minute synthesis run to a "terminated"
 * request before this existed.
 */
export function finalReport(events: AgentEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "final_response" && typeof e.content === "string" && e.content.trim()) {
      return e.content;
    }
  }
  return null;
}

/** Firestore's doc limit is 1 MiB; chunk well under it, on a character budget. */
export const TRANSCRIPT_CHUNK_CHARS = 200_000;

export function chunkTranscript(text: string, size = TRANSCRIPT_CHUNK_CHARS): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}
