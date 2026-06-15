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
});
