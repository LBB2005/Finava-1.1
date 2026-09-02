import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ recordUsage: vi.fn() }));
vi.mock("@/lib/usage", () => ({ recordUsage: deps.recordUsage }));

/** Import fresh so the module-level `KEY = process.env.PERPLEXITY_API_KEY` is re-read. */
async function loadPerplexity(key: string | null = "pplx_test") {
  vi.resetModules();
  // `null` means "unset" — passing `undefined` would re-trigger the default.
  vi.stubEnv("PERPLEXITY_API_KEY", key ?? undefined);
  return import("./perplexity");
}

const fetchMock = vi.fn();

function ok(content: string | undefined) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: content === undefined ? [] : [{ message: { content } }] }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.recordUsage.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(ok("Answer."));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("perplexitySearch", () => {
  it("returns the assistant message content", async () => {
    const { perplexitySearch } = await loadPerplexity();
    await expect(perplexitySearch("What is AAPL's moat?")).resolves.toBe("Answer.");
  });

  it("posts the prompt as the user turn behind a financial-analyst system prompt", async () => {
    const { perplexitySearch } = await loadPerplexity();
    await perplexitySearch("What is AAPL's moat?");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.perplexity.ai/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer pplx_test");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("sonar-pro");
    expect(body.max_tokens).toBe(2000);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("financial research assistant");
    expect(body.messages[1]).toEqual({ role: "user", content: "What is AAPL's moat?" });
  });

  it("defaults to sonar-pro and honours an explicit model", async () => {
    const { perplexitySearch } = await loadPerplexity();
    await perplexitySearch("q", "sonar");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("sonar");
  });

  it("meters a flat per-model credit cost", async () => {
    const { perplexitySearch } = await loadPerplexity();
    await perplexitySearch("q", "sonar-pro");
    expect(deps.recordUsage).toHaveBeenCalledWith({
      agent: "perplexity",
      model: "perplexity/sonar-pro",
      flatCredits: 150,
    });

    deps.recordUsage.mockClear();
    await perplexitySearch("q", "sonar");
    expect(deps.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: "perplexity/sonar", flatCredits: 80 }),
    );
  });

  it("returns a placeholder — and never calls out — when no key is configured", async () => {
    const { perplexitySearch } = await loadPerplexity(null);
    await expect(perplexitySearch("q")).resolves.toBe("Perplexity API key not configured.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deps.recordUsage).not.toHaveBeenCalled();
  });

  it("throws with the status on a non-ok response, and does not meter", async () => {
    const { perplexitySearch } = await loadPerplexity();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });
    await expect(perplexitySearch("q")).rejects.toThrow("Perplexity 502");
    expect(deps.recordUsage).not.toHaveBeenCalled();
  });

  it("falls back to 'No response' when the payload has no choices", async () => {
    const { perplexitySearch } = await loadPerplexity();
    fetchMock.mockResolvedValueOnce(ok(undefined));
    await expect(perplexitySearch("q")).resolves.toBe("No response");
  });

  it("aborts a hung request via a 30s timeout signal", async () => {
    const { perplexitySearch } = await loadPerplexity();
    await perplexitySearch("q");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("as-of clipping", () => {
  it("sends no date filters outside a scoped run", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx_key";
    const { perplexitySearch } = await loadPerplexity();
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ choices: [{ message: { content: "ok" } }] })
    );

    await perplexitySearch("what happened");

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.search_before_date_filter).toBeUndefined();
    expect(body.last_updated_before_filter).toBeUndefined();
  });

  it("clips publication AND revision to the run's as-of day", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx_key";
    const { perplexitySearch } = await loadPerplexity();
    const { withAsOfScope } = await import("./asOfScope");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ choices: [{ message: { content: "ok" } }] })
    );

    await withAsOfScope("2026-06-11T13:15:00.000Z", () =>
      perplexitySearch("what happened")
    );

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    // Publication alone is not enough: a June page rewritten in September still
    // carries September's facts unless the revision is bounded too.
    expect(body.search_before_date_filter).toBe("06/11/2026");
    expect(body.last_updated_before_filter).toBe("06/11/2026");
  });
});
