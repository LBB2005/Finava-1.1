import { z } from "zod";

/** The six factor keys, mirrored from `@/lib/research` `FactorKey` for runtime validation. */
export const FACTOR_KEYS = ["mom", "growth", "quality", "analyst", "value", "health"] as const;

const TickerSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z.string().min(1, "Ticker is required").max(10)
);

const DirectionSchema = z.enum(["bull", "bear", "watching"]);
const StatusSchema = z.enum(["forming", "playing_out", "broken", "closed"]);
const SourceSchema = z.enum(["manual", "holding", "chat", "confirmed"]);
const FactorTagsSchema = z.array(z.enum(FACTOR_KEYS)).max(6).optional().default([]);

export const CreateConvictionSchema = z.object({
  ticker: TickerSchema,
  direction: DirectionSchema.optional().default("watching"),
  thesisTrait: z.string().trim().min(1, "A thesis is required").max(120),
  factorTags: FactorTagsSchema,
  reasoning: z.string().max(4_000).optional().default(""),
  falsifier: z.string().max(500).optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  status: StatusSchema.optional().default("forming"),
  source: SourceSchema.optional().default("manual"),
});

export type CreateConvictionBody = z.infer<typeof CreateConvictionSchema>;

export const UpdateConvictionSchema = z
  .object({
    direction: DirectionSchema.optional(),
    thesisTrait: z.string().trim().min(1).max(120).optional(),
    factorTags: z.array(z.enum(FACTOR_KEYS)).max(6).optional(),
    reasoning: z.string().max(4_000).optional(),
    falsifier: z.string().max(500).optional(),
    confidence: z.number().min(0).max(1).optional(),
    status: StatusSchema.optional(),
    outcomePct: z.number().finite().nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export type UpdateConvictionBody = z.infer<typeof UpdateConvictionSchema>;
