import { recordUsage } from "@/lib/usage";

const BASE = "https://api.perplexity.ai";
const KEY = process.env.PERPLEXITY_API_KEY;

// Perplexity doesn't return token counts, so we meter a flat estimated cost per
// call (1 credit = $0.001). sonar-pro is the pricier model. TUNE to live rates.
const PERPLEXITY_FLAT_CREDITS: Record<string, number> = {
  "sonar-pro": 150, // ≈ $0.15
  sonar: 80, // ≈ $0.08
};

export async function perplexitySearch(
  prompt: string,
  model: "sonar-pro" | "sonar" = "sonar-pro"
): Promise<string> {
  if (!KEY) return "Perplexity API key not configured.";

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a financial research assistant. Provide concise, accurate, up-to-date financial analysis with specific data points and sources where available.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
    }),
  });

  if (!res.ok) throw new Error(`Perplexity ${res.status}`);
  const data = await res.json();
  // Meter the call against the ambient user's usage (no-op outside a user context).
  void recordUsage({
    agent: "perplexity",
    model: `perplexity/${model}`,
    flatCredits: PERPLEXITY_FLAT_CREDITS[model] ?? 100,
  });
  return data.choices?.[0]?.message?.content ?? "No response";
}
