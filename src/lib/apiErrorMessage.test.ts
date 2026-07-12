import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "@/lib/apiErrorMessage";

describe("apiErrorMessage", () => {
  it("prefers the top-level message from structured apiError responses", () => {
    expect(
      apiErrorMessage(
        { error: { code: "validation_error", message: "Validation failed" }, message: "Validation failed" },
        "Fallback"
      )
    ).toBe("Validation failed");
  });

  it("supports legacy string error responses", () => {
    expect(apiErrorMessage({ error: "Old shape" }, "Fallback")).toBe("Old shape");
  });

  it("falls back when the payload is unknown", () => {
    expect(apiErrorMessage(null, "Fallback")).toBe("Fallback");
  });

  it("digs into a nested error.message when there's no top-level string", () => {
    expect(apiErrorMessage({ error: { message: "Upstream 503" } }, "Fallback")).toBe("Upstream 503");
  });

  it("ignores blank / whitespace-only strings at every level", () => {
    expect(apiErrorMessage({ message: "   ", error: "" }, "Fallback")).toBe("Fallback");
    expect(apiErrorMessage({ error: { message: "  " } }, "Fallback")).toBe("Fallback");
  });

  it("falls back for non-object payloads and objects with no usable message", () => {
    expect(apiErrorMessage("just a string", "Fallback")).toBe("Fallback");
    expect(apiErrorMessage(42, "Fallback")).toBe("Fallback");
    expect(apiErrorMessage({ error: { code: 500 } }, "Fallback")).toBe("Fallback");
    expect(apiErrorMessage({}, "Fallback")).toBe("Fallback");
  });
});
