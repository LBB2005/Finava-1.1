// Step 2 — reconcile the book against the broker.
//
// The broker is the authority on what the book HOLDS; Firestore is the authority
// on WHY. This step joins them: Alpaca's positions supply quantities and prices,
// the decision ledger supplies the thesis that opened each one, and the result is
// written as an immutable BookSnapshot.
//
// The snapshot is deliberately self-contained. Re-deriving a past day's book from
// order history months later must never be necessary to render it — a record you
// can only reconstruct by replaying is a record that quietly changes when the
// replay logic changes.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withHarness, runStep, easternDay } from "@/lib/live/harness";
import { getAccount, getPositions, alpacaTradingConfigured } from "@/lib/alpacaTrading";
import { evaluateDrawdown } from "@/lib/live/mandate";
import { MANDATE_V1, type LivePosition, type BookSnapshot } from "@/lib/schemas/live/snapshot";
import { appendSnapshot, appendEvent, LedgerConflictError } from "@/lib/live/ledger";
import { getPriorSnapshot, getOpeningDecisions, countEntriesToday } from "@/lib/live/ledgerRead";
import { apiError } from "@/lib/apiError";
import { AGENT_VERSION, executionMode } from "@/lib/live/version";
import { logger } from "@/lib/logger";

const log = logger("live:reconcile");

export const maxDuration = 300;

const BodySchema = z.object({ runId: z.string().min(1) }).optional();

export const POST = withHarness(async (req) => {
  if (!alpacaTradingConfigured()) {
    return apiError("not_configured", "Alpaca paper trading is not configured", 503);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => undefined));
  const tradingDay = easternDay();
  const runId = (parsed.success && parsed.data?.runId) || tradingDay;

  const { result, replayed } = await runStep(runId, "reconcile", async () => {
    const [account, brokerPositions, prior] = await Promise.all([
      getAccount(),
      getPositions(),
      getPriorSnapshot(tradingDay),
    ]);

    const equity = account.equity;
    const drawdown = evaluateDrawdown(
      MANDATE_V1,
      equity,
      prior?.highWaterMark ?? MANDATE_V1.startingEquity,
      prior?.freezeDaysRemaining ?? 0
    );

    const openedBy = await getOpeningDecisions(brokerPositions.map((p) => p.symbol));
    const priorTargets = new Map(prior?.positions?.map((p) => [p.ticker, p.targetWeightPct]) ?? []);

    const positions: LivePosition[] = brokerPositions.map((p) => {
      const weightPct = equity > 0 ? (p.marketValue / equity) * 100 : 0;
      const opened = openedBy.get(p.symbol) ?? null;
      return {
        ticker: p.symbol,
        side: p.side,
        qty: p.qty,
        avgEntryPrice: p.avgEntryPrice,
        currentPrice: p.currentPrice,
        marketValue: p.marketValue,
        costBasis: p.costBasis,
        unrealizedPlPct: p.unrealizedPlPct,
        weightPct,
        // Absent a recorded target the live weight IS the target: pretending to a
        // target we never set would manufacture drift that no decision caused.
        targetWeightPct: priorTargets.get(p.symbol) ?? weightPct,
        openedByDecisionId: opened?.decisionId ?? null,
        openedOn: opened?.tradingDay ?? null,
        dataGap: false,
      };
    });

    const grossExposurePct = positions.reduce((s, p) => s + Math.abs(p.weightPct), 0);
    const shortExposurePct = positions
      .filter((p) => p.side === "short")
      .reduce((s, p) => s + Math.abs(p.weightPct), 0);

    const snapshot: BookSnapshot = {
      tradingDay,
      runId,
      equity,
      cash: account.cash,
      cashPct: equity > 0 ? (account.cash / equity) * 100 : 0,
      cumulativeReturnPct:
        ((equity - MANDATE_V1.startingEquity) / MANDATE_V1.startingEquity) * 100,
      // Filled by the export step against the benchmark series; null here rather
      // than 0, because 0 is a claim and null is the absence of one.
      benchmarkCumulativeReturnPct: null,
      highWaterMark: drawdown.highWaterMark,
      drawdownPct: drawdown.drawdownPct,
      entriesFrozen: drawdown.frozen,
      freezeDaysRemaining: drawdown.freezeDaysRemaining,
      positions,
      grossExposurePct,
      shortExposurePct,
      agentVersion: AGENT_VERSION,
      executionMode: executionMode(),
      createdAt: new Date().toISOString(),
    };

    try {
      await appendSnapshot(snapshot);
    } catch (err) {
      // A replayed step that got past runStep (e.g. the process died between the
      // ledger write and the step record) must not fail the run — the snapshot is
      // already there and it is immutable, so the existing one stands.
      if (!(err instanceof LedgerConflictError)) throw err;
      log.warn("snapshot already appended, reusing", { tradingDay });
    }

    if (drawdown.tripped) {
      await appendEvent({
        eventId: `${tradingDay}-drawdown-tripped`,
        tradingDay,
        kind: "rail_tripped",
        message:
          `Drawdown ${drawdown.drawdownPct.toFixed(1)}% breached the ` +
          `${MANDATE_V1.drawdownFreezePct}% rail. No new entries for ` +
          `${MANDATE_V1.drawdownFreezeDays} trading days; an agent review is owed.`,
        detail: { equity, highWaterMark: drawdown.highWaterMark },
        createdAt: new Date().toISOString(),
      });
    }

    return {
      runId,
      tradingDay,
      snapshot,
      drawdown,
      entriesToday: await countEntriesToday(tradingDay),
      accountBlocked: account.accountBlocked || account.tradingBlocked,
    };
  });

  return NextResponse.json({ ...result, replayed });
});
