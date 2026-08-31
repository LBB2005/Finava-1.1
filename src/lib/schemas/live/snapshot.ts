// End-of-run book state, plus the frozen mandate the run was judged against.
//
// A snapshot is written once per trading day and never edited. It is what the
// equity curve, the drawdown rail and the public book view all read from, so it
// has to stand alone: re-deriving the book from the order history months later
// must not be necessary to render a past day.

import { z } from "zod";

export const LivePositionSchema = z.object({
  ticker: z.string().min(1).max(10),
  side: z.enum(["long", "short"]),
  qty: z.number(),
  avgEntryPrice: z.number(),
  currentPrice: z.number(),
  marketValue: z.number(),
  costBasis: z.number(),
  unrealizedPlPct: z.number(),
  /** Live weight, and the weight the mandate wanted — drift is the difference. */
  weightPct: z.number(),
  targetWeightPct: z.number(),
  /** The decision that opened this position, so the thesis is one hop away. */
  openedByDecisionId: z.string().nullable(),
  openedOn: z.string().nullable(),
  /** Raised after three consecutive `failed` evaluations on any of its conditions. */
  dataGap: z.boolean().default(false),
});
export type LivePosition = z.infer<typeof LivePositionSchema>;

export const BookSnapshotSchema = z.object({
  tradingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  runId: z.string().min(1),

  equity: z.number(),
  cash: z.number(),
  cashPct: z.number(),
  /** Percent from inception — the reporting unit, so paper and live concatenate. */
  cumulativeReturnPct: z.number(),
  benchmarkCumulativeReturnPct: z.number().nullable(),

  highWaterMark: z.number(),
  drawdownPct: z.number(),
  /** Set when drawdown breached the rail; blocks new entries until it clears. */
  entriesFrozenUntil: z.string().nullable(),

  positions: z.array(LivePositionSchema),
  grossExposurePct: z.number(),
  shortExposurePct: z.number(),

  agentVersion: z.string().min(1).max(30),
  executionMode: z.enum(["shadow", "paper", "live"]),
  createdAt: z.string(),
});
export type BookSnapshot = z.infer<typeof BookSnapshotSchema>;

/**
 * The mandate. Frozen at launch and never changed mid-run — a track record whose
 * rules moved measures nothing coherent. Stored in liveConfig/mandate write-once
 * and echoed into each day's published files so a reader can check the rules the
 * decisions were actually made under.
 */
export const MandateSchema = z.object({
  version: z.string().min(1).max(30),
  startingEquity: z.number().positive(),

  minPositions: z.number().int().positive(),
  maxPositions: z.number().int().positive(),
  minWeightPct: z.number().positive(),
  maxEntryWeightPct: z.number().positive(),
  maxDriftWeightPct: z.number().positive(),
  maxCashPct: z.number().min(0).max(100),
  maxNewEntriesPerDay: z.number().int().positive(),
  minHoldDays: z.number().int().min(0),

  maxShorts: z.number().int().min(0),
  maxShortWeightPct: z.number().min(0),
  maxGrossShortPct: z.number().min(0),
  shortStopLossPct: z.number(),
  shortMinMarketCapUsd: z.number().min(0),
  shortMaxShortInterestPct: z.number().min(0),

  minMarketCapUsd: z.number().min(0),
  minAvgDollarVolumeUsd: z.number().min(0),
  earningsBlackoutDays: z.number().int().min(0),

  drawdownFreezePct: z.number().positive(),
  drawdownFreezeDays: z.number().int().positive(),
});
export type Mandate = z.infer<typeof MandateSchema>;

/** The mandate as launched. Changing any value here invalidates the track record. */
export const MANDATE_V1: Mandate = {
  version: "v1",
  startingEquity: 10_000,
  minPositions: 8,
  maxPositions: 15,
  minWeightPct: 3,
  maxEntryWeightPct: 12,
  maxDriftWeightPct: 18,
  maxCashPct: 30,
  maxNewEntriesPerDay: 3,
  minHoldDays: 3,
  maxShorts: 3,
  maxShortWeightPct: 5,
  maxGrossShortPct: 15,
  shortStopLossPct: 25,
  shortMinMarketCapUsd: 5_000_000_000,
  shortMaxShortInterestPct: 20,
  minMarketCapUsd: 2_000_000_000,
  minAvgDollarVolumeUsd: 10_000_000,
  earningsBlackoutDays: 2,
  drawdownFreezePct: 15,
  drawdownFreezeDays: 3,
};
