// Step 1 — open the run.
//
// Two jobs, both gates rather than work:
//
//  1. Is today a session? The Actions cron fires on a UTC schedule that drifts an
//     hour across DST and can be delayed 10-30 minutes, so the run asks the
//     EXCHANGE — via Alpaca's calendar — instead of trusting the clock that
//     triggered it. A holiday returns skip:true and the workflow exits cleanly
//     rather than producing an empty day that looks like a failure.
//
//  2. Pre-warm getFactorUniverse(). Cold, it fans ~500 tickers and would eat most
//     of a later step's 300s on its own. Warming it here, where nothing else
//     competes for the budget, is why the scout step fits.
//
// Also fails fast on a budget already exhausted by an earlier partial run.

import { NextResponse } from "next/server";
import { withHarness, runStep, easternDay } from "@/lib/live/harness";
import { readBudget } from "@/lib/live/budget";
import { establishAsOf } from "@/lib/live/asOf";
import { getCalendar, isTradingDay, alpacaTradingConfigured } from "@/lib/alpacaTrading";
import { getFactorUniverse } from "@/lib/factorUniverse";
import { apiError } from "@/lib/apiError";
import { logger } from "@/lib/logger";

const log = logger("live:session");

export const maxDuration = 300;

export const POST = withHarness(async () => {
  if (!alpacaTradingConfigured()) {
    return apiError(
      "not_configured",
      "Alpaca paper trading is not configured (keys missing, or the base URL is not the paper sandbox)",
      503
    );
  }

  const tradingDay = easternDay();
  // runId IS the trading day: one run per day, and a replayed workflow lands on
  // the same document rather than starting a parallel book.
  const runId = tradingDay;

  const budget = await readBudget(runId);
  if (budget.exhausted) {
    return apiError("budget_exceeded", "Daily credit cap already reached for this run", 429, budget);
  }

  const { result, replayed } = await runStep(runId, "session_open", async () => {
    // The run's as-of instant, minted once here and read by every later step.
    // It lives in the step result rather than a fresh Date() per step because
    // runStep persists results: a replayed workflow returns THIS instant instead
    // of minting a later one, so the decision stays reproducible against the
    // information set that produced it.
    const asOf = establishAsOf();
    const calendar = await getCalendar(tradingDay, tradingDay);
    if (!isTradingDay(calendar, tradingDay)) {
      log.info("not a trading day", { tradingDay });
      return { runId, tradingDay, asOf, skip: true, reason: "not a trading session", universeSize: 0 };
    }

    // Warm the shared factor memo. A failure here is not fatal — the scout can
    // still fetch it — but it IS worth surfacing, because a cold scout is the
    // step most likely to time out.
    let universeSize = 0;
    try {
      universeSize = (await getFactorUniverse()).stocks.length;
    } catch (err) {
      log.warn("factor universe pre-warm failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      runId,
      tradingDay,
      asOf,
      skip: false,
      sessionOpen: calendar[0]?.open ?? null,
      sessionClose: calendar[0]?.close ?? null,
      universeSize,
    };
  });

  return NextResponse.json({ ...result, replayed, budget });
});
