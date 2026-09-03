import { describe, expect, it } from "vitest";
import {
  FORMAT_PRESETS,
  buildTemplateBlock,
  isFormatKey,
  sanitizeFormats,
  type FormatKey,
} from "./templates";

describe("isFormatKey", () => {
  it("accepts every shipped preset key", () => {
    for (const p of FORMAT_PRESETS) expect(isFormatKey(p.key)).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isFormatKey("essay")).toBe(false);
    expect(isFormatKey("")).toBe(false);
    expect(isFormatKey(null)).toBe(false);
    expect(isFormatKey(undefined)).toBe(false);
    expect(isFormatKey(7)).toBe(false);
    expect(isFormatKey(["brief"])).toBe(false);
  });
});

describe("sanitizeFormats", () => {
  it("keeps known keys in order", () => {
    expect(sanitizeFormats(["brief", "table"])).toEqual(["brief", "table"]);
  });

  it("drops unknown entries", () => {
    expect(sanitizeFormats(["brief", "essay", 3, null])).toEqual(["brief"]);
  });

  it("de-duplicates", () => {
    expect(sanitizeFormats(["brief", "brief", "table", "brief"])).toEqual(["brief", "table"]);
  });

  it("wraps a single legacy `format` string", () => {
    expect(sanitizeFormats("deep_memo")).toEqual(["deep_memo"]);
  });

  it("returns [] for null/undefined and for a non-matching scalar", () => {
    expect(sanitizeFormats(null)).toEqual([]);
    expect(sanitizeFormats(undefined)).toEqual([]);
    expect(sanitizeFormats("nope")).toEqual([]);
    expect(sanitizeFormats([])).toEqual([]);
  });
});

describe("buildTemplateBlock", () => {
  it("returns '' when there is nothing to inject (legacy playbook)", () => {
    expect(buildTemplateBlock(undefined, [])).toBe("");
    expect(buildTemplateBlock("   ", [])).toBe("");
  });

  it("includes the user's instructions", () => {
    const block = buildTemplateBlock("Always cite the filing.", []);
    expect(block).toContain("## Response preferences (user template)");
    expect(block).toContain("Their instructions: Always cite the filing.");
  });

  it("expands each chosen format to its snippet", () => {
    const block = buildTemplateBlock("", ["brief", "table"]);
    expect(block).toContain("Preferred format:");
    expect(block).toContain(FORMAT_PRESETS.find((p) => p.key === "brief")!.snippet);
    expect(block).toContain(FORMAT_PRESETS.find((p) => p.key === "table")!.snippet);
  });

  it("says 'pick the structure' when instructions exist but no format was chosen (Auto)", () => {
    const block = buildTemplateBlock("Be blunt.", []);
    expect(block).toContain("No specific format was chosen");
    expect(block).not.toContain("Preferred format:");
  });

  it("filters out unknown format keys before rendering", () => {
    const block = buildTemplateBlock("Be blunt.", ["brief", "essay" as FormatKey]);
    expect(block).toContain(FORMAT_PRESETS.find((p) => p.key === "brief")!.snippet);
    expect(block).not.toContain("essay");
  });

  it("falls back to the Auto line when every supplied format is unknown", () => {
    const block = buildTemplateBlock("Be blunt.", ["essay" as FormatKey]);
    expect(block).toContain("No specific format was chosen");
  });

  it("trims and clamps instructions to 2000 chars", () => {
    const block = buildTemplateBlock("  " + "x".repeat(2500) + "  ", []);
    expect(block).toContain("x".repeat(2000));
    expect(block).not.toContain("x".repeat(2001));
  });

  it("always subordinates the template to the compliance rules", () => {
    const block = buildTemplateBlock("Tell me what to buy.", ["verdict_first"]);
    expect(block).toContain("NEVER override the compliance rules");
    expect(block.trimEnd().endsWith("compliance wins.")).toBe(true);
  });
});
