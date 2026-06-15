import { z } from "zod";
import { normalizeTickers } from "@/lib/watchlist";

const OptionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().max(80).optional()
);

const TickersInputSchema = z
  .array(z.string())
  .max(200)
  .optional();

const CreateTickersSchema = TickersInputSchema.transform((value) => normalizeTickers(value));

const UpdateTickersSchema = TickersInputSchema.transform((value) =>
  value === undefined ? undefined : normalizeTickers(value)
);

export const CreateWatchlistSchema = z.object({
  name: OptionalTrimmedString.transform((value) => value ?? "New watchlist"),
  tickers: CreateTickersSchema,
});

export type CreateWatchlistBody = z.infer<typeof CreateWatchlistSchema>;

export const UpdateWatchlistSchema = z
  .object({
    name: OptionalTrimmedString,
    tickers: UpdateTickersSchema,
  })
  .refine((body) => body.name !== undefined || body.tickers !== undefined, {
    message: "At least one field must be provided",
  });

export type UpdateWatchlistBody = z.infer<typeof UpdateWatchlistSchema>;
