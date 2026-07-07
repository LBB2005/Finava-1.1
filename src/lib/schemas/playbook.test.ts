import { describe, expect, it } from "vitest";
import {
  CreatePlaybookSchema,
  MAX_STEPS,
  MAX_STEP_CHARS,
  MAX_TITLE_CHARS,
  MAX_INSTRUCTIONS_CHARS,
} from "@/lib/schemas/playbook";

describe("playbook schema", () => {
  it("trims the title, drops blank steps, and defaults optional fields", () => {
    expect(
      CreatePlaybookSchema.parse({
        title: "  Earnings deep-dive  ",
        steps: ["  first  ", "", "   ", "second", 42],
      })
    ).toMatchObject({
      title: "Earnings deep-dive",
      steps: ["first", "second"],
      instructions: "",
      sourceConversationId: null,
    });
  });

  it("truncates over-long fields rather than rejecting them", () => {
    const parsed = CreatePlaybookSchema.parse({
      title: "x".repeat(MAX_TITLE_CHARS + 50),
      steps: ["y".repeat(MAX_STEP_CHARS + 50)],
      instructions: "z".repeat(MAX_INSTRUCTIONS_CHARS + 50),
    });
    expect(parsed.title).toHaveLength(MAX_TITLE_CHARS);
    expect(parsed.steps[0]).toHaveLength(MAX_STEP_CHARS);
    expect(parsed.instructions).toHaveLength(MAX_INSTRUCTIONS_CHARS);
  });

  it("caps the number of steps", () => {
    const parsed = CreatePlaybookSchema.parse({
      title: "Many steps",
      steps: Array.from({ length: MAX_STEPS + 10 }, (_, i) => `step ${i}`),
    });
    expect(parsed.steps).toHaveLength(MAX_STEPS);
  });

  it("requires a non-empty title", () => {
    expect(() => CreatePlaybookSchema.parse({ title: "   " })).toThrow(/name is required/);
    expect(() => CreatePlaybookSchema.parse({ steps: ["a"] })).toThrow();
  });

  it("keeps sourceConversationId only when it is a string", () => {
    expect(CreatePlaybookSchema.parse({ title: "T", sourceConversationId: "conv_1" }))
      .toMatchObject({ sourceConversationId: "conv_1" });
    expect(CreatePlaybookSchema.parse({ title: "T", sourceConversationId: 99 }))
      .toMatchObject({ sourceConversationId: null });
  });
});
