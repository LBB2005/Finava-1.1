import { describe, it, expect } from "vitest";
import { collector, renderTranscript, chunkTranscript } from "./collect";
import type { AgentEvent } from "@/types/chat";

const ev = (e: Record<string, unknown> & { type: string }) => e as unknown as AgentEvent;

describe("collector", () => {
  it("records every event in order", () => {
    const { emit, collected } = collector();
    emit(ev({ type: "agent_start", agent: "risk" }));
    emit(ev({ type: "agent_complete", agent: "risk" }));
    expect(collected.events.map((e) => e.type)).toEqual(["agent_start", "agent_complete"]);
  });

  it("finds the first event of a type", () => {
    const { emit, collected } = collector();
    emit(ev({ type: "agent_start", agent: "a" }));
    emit(ev({ type: "agent_start", agent: "b" }));
    expect(collected.first("agent_start")).toMatchObject({ agent: "a" });
  });

  it("returns null for a type that never fired", () => {
    const { collected } = collector();
    expect(collected.first("wave_result")).toBeNull();
  });

  it("collects all events of a type", () => {
    const { emit, collected } = collector();
    emit(ev({ type: "agent_start", agent: "a" }));
    emit(ev({ type: "agent_start", agent: "b" }));
    expect(collected.all("agent_start")).toHaveLength(2);
  });

  it("keeps two collectors independent", () => {
    const a = collector();
    const b = collector();
    a.emit(ev({ type: "agent_start", agent: "a" }));
    expect(b.collected.events).toHaveLength(0);
  });
});

describe("renderTranscript", () => {
  it("drops nothing — a tidied transcript is not a transcript", () => {
    const events = [
      ev({ type: "agent_start", agent: "risk" }),
      ev({ type: "ceo_thinking", content: "Concentration is the risk here." }),
      ev({ type: "agent_complete", agent: "risk" }),
    ];
    const out = renderTranscript(events);
    expect(out).toContain("[agent_start]");
    expect(out).toContain("Concentration is the risk here.");
    expect(out).toContain("[agent_complete]");
  });

  it("renders a non-text event as JSON so its occurrence survives", () => {
    const out = renderTranscript([ev({ type: "wave_start", waveIndex: 2, totalWaves: 3, tickers: ["NVDA"] })]);
    expect(out).toContain("wave_start");
    expect(out).toContain("2");
  });

  it("renders an empty stream as an empty string", () => {
    expect(renderTranscript([])).toBe("");
  });
});

describe("chunkTranscript", () => {
  it("leaves a small transcript whole", () => {
    expect(chunkTranscript("short")).toEqual(["short"]);
  });

  it("splits past the size limit", () => {
    const chunks = chunkTranscript("abcdefghij", 4);
    expect(chunks).toEqual(["abcd", "efgh", "ij"]);
  });

  it("loses no characters when splitting", () => {
    const text = "x".repeat(1000);
    expect(chunkTranscript(text, 128).join("")).toBe(text);
  });

  it("splits exactly at the boundary without emitting an empty chunk", () => {
    expect(chunkTranscript("abcd", 4)).toEqual(["abcd"]);
    expect(chunkTranscript("abcde", 4)).toEqual(["abcd", "e"]);
  });
});
