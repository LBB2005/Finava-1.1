import { z } from "zod";
import { normalizeTickers } from "@/lib/watchlist";

const OptionalTrimmedString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().max(max).optional()
  );

const RequiredTrimmedString = (max: number, message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, message).max(max)
  );

const MetricSchema = z.number().finite();
const ConfigSchema = z.record(z.string(), z.unknown());

const CreateTickersSchema = z
  .array(z.string())
  .max(100)
  .optional()
  .transform((value) => normalizeTickers(value));

const UpdateTickersSchema = z
  .array(z.string())
  .max(100)
  .optional()
  .transform((value) => (value === undefined ? undefined : normalizeTickers(value)));

export const CreateStrategySchema = z.object({
  name: RequiredTrimmedString(120, "Strategy name is required"),
  tag: OptionalTrimmedString(40).transform((value) => value ?? "Draft"),
  desc: z.string().max(10_000).optional().default(""),
  tickers: CreateTickersSchema,
  config: ConfigSchema.optional().default({}),
  research: z.string().max(100_000).optional().default(""),
  sharpe: MetricSchema.optional().default(0),
  cagr: MetricSchema.optional().default(0),
  maxDD: MetricSchema.optional().default(0),
  winRate: MetricSchema.optional().default(0),
});

export type CreateStrategyBody = z.infer<typeof CreateStrategySchema>;

export const UpdateStrategySchema = z
  .object({
    active: z.boolean().optional(),
    name: OptionalTrimmedString(120),
    tag: OptionalTrimmedString(40),
    desc: z.string().max(10_000).optional(),
    tickers: UpdateTickersSchema,
    config: ConfigSchema.optional(),
    research: z.string().max(100_000).optional(),
    lastTrade: z.string().max(200).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

export type UpdateStrategyBody = z.infer<typeof UpdateStrategySchema>;
