import { NextResponse } from "next/server";
import { generate, type LlmContentPart } from "@/lib/llm";
import { requireAuth } from "@/lib/requireAuth";
import { checkUsageLimit, usageStore } from "@/lib/usage";
import { apiError } from "@/lib/apiError";
import { userRateLimit } from "@/lib/rateLimit";
import { DATA_ACCURACY_RULE_JSON } from "@/lib/dataAccuracy";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const throttled = await userRateLimit(userId, "portfolio-statement", {
    capacity: 3,
    refillPerSec: 0.03,
  });
  if (throttled) return throttled;
  const limited = await checkUsageLimit(userId);
  if (limited) return limited;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return apiError("missing_file", "No file provided", 400);
    if (file.size > MAX_STATEMENT_BYTES) {
      return apiError("file_too_large", "Statement file must be 10 MB or smaller", 413);
    }
    if (!SUPPORTED_TYPES.has(file.type)) {
      return apiError("unsupported_file_type", "Upload a PDF, PNG, JPEG, or WebP statement", 415);
    }

    return await usageStore.run({ userId }, async () => {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const isPdf = file.type === "application/pdf";

      const extractPrompt = `Extract all stock and ETF holdings AND the cash/buying power balance from this brokerage/portfolio statement.
Return ONLY a JSON object with this exact shape:
{"buyingPower":1234.56,"holdings":[{"ticker":"AAPL","companyName":"Apple Inc.","shares":10.0,"avgCost":150.00}]}

Rules for holdings:
- ticker: stock symbol (string, uppercase, required)
- companyName: full company name or null if not shown
- shares: number of shares owned (float, required)
- avgCost: average cost per share in USD (float, use null if not shown)
- Include stocks and ETFs only — skip bonds, options, cash, and money market funds
- If cost basis shows total cost (not per share), divide by shares to get per-share cost

Rules for buyingPower:
- Look for labels like: Buying Power, Cash, Cash Balance, Available Cash, Settled Cash, Available to Trade, Cash & Cash Equivalents, Money Market
- Use the total USD cash/buying power value as a number (float)
- Use null if no cash balance is visible in the statement

${DATA_ACCURACY_RULE_JSON}

Return only the JSON object, no other text`;

      // OpenRouter (OpenAI-compatible) content parts: a `file` part for PDFs and an
      // `image_url` data URL for images. Same Sonnet 4.6 model as before, via the gateway.
      const contentBlock: LlmContentPart = isPdf
        ? {
            type: "file",
            file: {
              filename: file.name || "statement.pdf",
              file_data: `data:application/pdf;base64,${base64}`,
            },
          }
        : {
            type: "image_url",
            image_url: { url: `data:${file.type};base64,${base64}` },
          };

      const text = await generate({
        agent: "portfolioStatement",
        maxTokens: 2000,
        content: [contentBlock, { type: "text", text: extractPrompt }],
      });

      if (!text) return apiError("empty_ai_response", "No response from AI", 500);

      // Try to parse the full object shape first, fall back to bare array
      const objMatch = text.match(/\{[\s\S]*\}/);
      const arrMatch = text.match(/\[[\s\S]*\]/);
      if (!objMatch && !arrMatch) {
        return apiError("statement_parse_failed", "Could not parse holdings from statement", 422);
      }

      let holdings: unknown[];
      let buyingPower: number | null = null;

      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]);
        holdings = Array.isArray(parsed.holdings) ? parsed.holdings : [];
        buyingPower = typeof parsed.buyingPower === "number" ? parsed.buyingPower : null;
      } else {
        holdings = JSON.parse(arrMatch![0]);
      }

      const sanitized = (holdings as Record<string, unknown>[])
        .map((h) => ({
          ticker: typeof h.ticker === "string" ? h.ticker.toUpperCase().trim() : null,
          companyName: typeof h.companyName === "string" ? h.companyName : null,
          shares: typeof h.shares === "number" ? h.shares : typeof h.shares === "string" ? parseFloat(h.shares) : null,
          avgCost: typeof h.avgCost === "number" ? h.avgCost : typeof h.avgCost === "string" ? parseFloat(h.avgCost) : null,
        }))
        .filter((h) => h.ticker && typeof h.shares === "number" && !isNaN(h.shares) && h.shares > 0);

      return NextResponse.json({ holdings: sanitized, buyingPower });
    });
  } catch (err) {
    console.error("[statement POST]", err);
    return apiError("statement_failed", "Failed to process statement", 500);
  }
}
