import { z } from "zod";
import { isValidTicker } from "@/lib/tickers";

/**
 * Body schema for `POST /api/portfolio` (add / upsert a holding).
 *
 * Mirrors the prior manual validation: ticker is a required non-empty string,
 * shares must be positive, avgCost must be non-negative, and companyName/sector
 * are optional and may be explicitly null.
 */
export const AddHoldingSchema = z.object({
  ticker: z
    .string()
    .min(1, "ticker is required")
    .transform((t) => t.trim().toUpperCase())
    .refine(isValidTicker, "ticker must be a valid symbol (e.g. AAPL, BRK.B)"),
  companyName: z.string().nullable().optional(),
  shares: z.number().positive("shares must be positive"),
  avgCost: z.number().min(0, "avgCost cannot be negative"),
  sector: z.string().nullable().optional(),
});

export type AddHoldingBody = z.infer<typeof AddHoldingSchema>;

export const UpdateHoldingSchema = z
  .object({
    companyName: z.string().nullable().optional(),
    shares: z.number().positive("shares must be positive").optional(),
    avgCost: z.number().min(0, "avgCost cannot be negative").optional(),
    sector: z.string().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateHoldingBody = z.infer<typeof UpdateHoldingSchema>;

export const PortfolioSettingsSchema = z.object({
  cashBalance: z.number().min(0, "cashBalance must be a non-negative number"),
});

export type PortfolioSettingsBody = z.infer<typeof PortfolioSettingsSchema>;
