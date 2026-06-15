import { z } from "zod";
import { isValidTicker } from "@/lib/tickers";

export const BacktestRequestSchema = z.object({
  query: z.string().trim().min(1, "Query required").max(2_000),
  portfolioTickers: z
    .array(
      z
        .string()
        .trim()
        .transform((ticker) => ticker.toUpperCase())
        .refine(isValidTicker, "ticker must be a valid symbol")
    )
    .max(100)
    .optional(),
});

export type BacktestRequestBody = z.infer<typeof BacktestRequestSchema>;
