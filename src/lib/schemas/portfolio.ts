import { z } from "zod";

/**
 * Body schema for `POST /api/portfolio` (add / upsert a holding).
 *
 * Mirrors the prior manual validation: ticker is a required non-empty string,
 * shares must be positive, avgCost must be non-negative, and companyName/sector
 * are optional and may be explicitly null.
 */
export const AddHoldingSchema = z.object({
  ticker: z.string().min(1, "ticker is required"),
  companyName: z.string().nullable().optional(),
  shares: z.number().positive("shares must be positive"),
  avgCost: z.number().min(0, "avgCost cannot be negative"),
  sector: z.string().nullable().optional(),
});

export type AddHoldingBody = z.infer<typeof AddHoldingSchema>;
