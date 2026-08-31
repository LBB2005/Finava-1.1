// The mandate rule engine — every rail Finava Live trades under.
//
// Pure: no I/O, no clock, no Firestore. Everything it needs is an argument, so
// every rail is table-testable and the whole engine can be re-run over a past
// day to reproduce exactly why a decision was allowed or blocked.
//
// Two policies worth stating up front, because they show up everywhere below:
//
//  1. MISSING DATA BLOCKS. If a candidate's market cap or dollar volume is null,
//     eligibility FAILS. We cannot verify the name is inside the mandate, and a
//     rail that passes when it can't see is not a rail. Same discipline as the
//     invalidation evaluator, where `indeterminate` never counts as `holding`.
//
//  2. RAILS ARE MECHANICAL, NOT JUDGEMENT. Nothing here is a veto over the crew.
//     These are the constraints declared before the run started; the crew picks
//     freely inside them. A blocked decision is still recorded and published.

import type { Mandate, LivePosition } from "@/lib/schemas/live/snapshot";

/** One rail's verdict. Recorded on the decision so a reader sees what was checked. */
export interface MandateCheck {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface MandateVerdict {
  allowed: boolean;
  checks: MandateCheck[];
  /** The weight the mandate permits, after clamping. 0 when not allowed. */
  allowedWeightPct: number;
}

/** Book state the rails need. Supplied by the reconcile step. */
export interface BookState {
  equity: number;
  cashPct: number;
  positions: LivePosition[];
  /** Entries already placed today, so max-per-day can be enforced across a run. */
  entriesToday: number;
  /** Set while the drawdown rail is tripped; blocks new entries. */
  entriesFrozen: boolean;
}

/** What we know about a candidate at decision time. Nulls mean "couldn't verify". */
export interface CandidateFacts {
  ticker: string;
  side: "long" | "short";
  /** GICS sector. Null when unresolved — the concentration rail refuses on null. */
  sector: string | null;
  marketCapUsd: number | null;
  avgDollarVolumeUsd: number | null;
  shortInterestPct: number | null;
  /** Trading days until the next scheduled report; null when unknown. */
  daysToNextEarnings: number | null;
  usListed: boolean;
  isLeveragedOrInverseEtf: boolean;
  isOption: boolean;
}

function check(rule: string, passed: boolean, detail: string): MandateCheck {
  return { rule, passed, detail };
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}bn`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}m`;
  return `$${n.toFixed(0)}`;
}

/**
 * Universe eligibility — the same for longs and shorts. Everything here is a
 * property of the security, not of the book.
 */
export function checkUniverse(m: Mandate, c: CandidateFacts): MandateCheck[] {
  return [
    check("us_listed", c.usListed, c.usListed ? "US-listed" : "not US-listed"),
    check(
      "no_derivatives",
      !c.isOption,
      c.isOption ? "options are out of mandate" : "common stock or ETF"
    ),
    check(
      "no_leveraged_etf",
      !c.isLeveragedOrInverseEtf,
      c.isLeveragedOrInverseEtf ? "leveraged/inverse ETF" : "not a leveraged/inverse ETF"
    ),
    check(
      "min_market_cap",
      c.marketCapUsd !== null && c.marketCapUsd >= m.minMarketCapUsd,
      c.marketCapUsd === null
        ? "market cap unavailable — cannot verify eligibility"
        : `${fmtUsd(c.marketCapUsd)} vs ${fmtUsd(m.minMarketCapUsd)} floor`
    ),
    check(
      "min_dollar_volume",
      c.avgDollarVolumeUsd !== null && c.avgDollarVolumeUsd >= m.minAvgDollarVolumeUsd,
      c.avgDollarVolumeUsd === null
        ? "dollar volume unavailable — cannot verify liquidity"
        : `${fmtUsd(c.avgDollarVolumeUsd)}/day vs ${fmtUsd(m.minAvgDollarVolumeUsd)} floor`
    ),
  ];
}

/** Short-specific rails. Returns [] for a long candidate. */
export function checkShortConstraints(
  m: Mandate,
  book: BookState,
  c: CandidateFacts,
  requestedWeightPct: number
): MandateCheck[] {
  if (c.side !== "short") return [];

  const openShorts = book.positions.filter((p) => p.side === "short");
  const grossShort = openShorts.reduce((a, p) => a + Math.abs(p.weightPct), 0);

  return [
    check(
      "max_concurrent_shorts",
      openShorts.length < m.maxShorts,
      `${openShorts.length} open vs ${m.maxShorts} max`
    ),
    check(
      "max_short_weight",
      requestedWeightPct <= m.maxShortWeightPct,
      `${requestedWeightPct.toFixed(1)}% vs ${m.maxShortWeightPct}% cap`
    ),
    check(
      "max_gross_short",
      grossShort + requestedWeightPct <= m.maxGrossShortPct,
      `${(grossShort + requestedWeightPct).toFixed(1)}% gross vs ${m.maxGrossShortPct}% cap`
    ),
    check(
      "short_min_market_cap",
      c.marketCapUsd !== null && c.marketCapUsd >= m.shortMinMarketCapUsd,
      c.marketCapUsd === null
        ? "market cap unavailable — cannot verify"
        : `${fmtUsd(c.marketCapUsd)} vs ${fmtUsd(m.shortMinMarketCapUsd)} short floor`
    ),
    check(
      "short_interest_ceiling",
      c.shortInterestPct !== null && c.shortInterestPct <= m.shortMaxShortInterestPct,
      c.shortInterestPct === null
        ? "short interest unavailable — squeeze risk unverifiable"
        : `${c.shortInterestPct.toFixed(1)}% vs ${m.shortMaxShortInterestPct}% ceiling`
    ),
  ];
}

/**
 * Can the book open this position, and at what weight?
 *
 * `requestedWeightPct` is what the crew asked for; the returned
 * `allowedWeightPct` is what the mandate permits. A request above the entry cap
 * is CLAMPED, not rejected — the crew's conviction still reads through, it just
 * can't exceed the declared ceiling. A request below the floor IS rejected,
 * because a sub-floor position is dust that adds turnover without adding signal.
 */
export function checkEntry(
  m: Mandate,
  book: BookState,
  c: CandidateFacts,
  requestedWeightPct: number
): MandateVerdict {
  const clamped = Math.min(requestedWeightPct, m.maxEntryWeightPct);

  const checks: MandateCheck[] = [
    check(
      "entries_not_frozen",
      !book.entriesFrozen,
      book.entriesFrozen ? "drawdown rail tripped — entries frozen" : "entries open"
    ),
    check(
      "max_entries_per_day",
      book.entriesToday < m.maxNewEntriesPerDay,
      `${book.entriesToday} placed today vs ${m.maxNewEntriesPerDay} max`
    ),
    check(
      "max_positions",
      book.positions.length < m.maxPositions,
      `${book.positions.length} open vs ${m.maxPositions} max`
    ),
    check(
      "not_already_held",
      !book.positions.some((p) => p.ticker === c.ticker),
      book.positions.some((p) => p.ticker === c.ticker)
        ? "already held — this would be an add, not an entry"
        : "not currently held"
    ),
    check(
      "min_weight",
      requestedWeightPct >= m.minWeightPct,
      `${requestedWeightPct.toFixed(1)}% vs ${m.minWeightPct}% floor`
    ),
    check(
      "earnings_blackout",
      c.daysToNextEarnings === null || c.daysToNextEarnings > m.earningsBlackoutDays,
      c.daysToNextEarnings === null
        ? "no scheduled earnings within the window"
        : `${c.daysToNextEarnings}d to earnings vs ${m.earningsBlackoutDays}d blackout`
    ),
    ...checkUniverse(m, c),
    ...checkSectorConcentration(m, book, c, clamped),
    ...checkShortConstraints(m, book, c, clamped),
  ];

  const allowed = checks.every((k) => k.passed);
  return { allowed, checks, allowedWeightPct: allowed ? clamped : 0 };
}

/**
 * Which declared exposure group a GICS sector belongs to, or the sector itself
 * when it is in no group. Returns null for an unknown sector.
 */
export function sectorGroupFor(m: Mandate, sector: string | null): string | null {
  if (!sector) return null;
  for (const [group, members] of Object.entries(m.sectorGroups)) {
    if (members.includes(sector)) return group;
  }
  return sector;
}

/** The cap that applies to a group or ungrouped sector. */
export function sectorCapFor(m: Mandate, group: string): number {
  return m.sectorGroupCapsPct[group] ?? m.defaultSectorCapPct;
}

/**
 * Concentration rail, checked at ENTRY only.
 *
 * Deliberately not applied to live weights. If it were, a sector winner
 * appreciating past its cap would force a sale — which contradicts how
 * single-name drift is already treated, where an 18% cap exists precisely
 * because a position growing is the book working. So this blocks a new entry
 * that would push a group over its cap; it never forces a trim on appreciation.
 *
 * An unresolved sector REFUSES the entry. Compliance that cannot be verified is
 * not compliance, and the same discipline applies to every null in this engine.
 */
export function checkSectorConcentration(
  m: Mandate,
  book: BookState,
  c: CandidateFacts,
  requestedWeightPct: number
): MandateCheck[] {
  const group = sectorGroupFor(m, c.sector);
  if (!group) {
    return [
      check(
        "sector_known",
        false,
        `sector could not be resolved for ${c.ticker} — cannot verify concentration`
      ),
    ];
  }

  const cap = sectorCapFor(m, group);
  const existing = book.positions
    .filter((p) => sectorGroupFor(m, p.sector) === group)
    .reduce((sum, p) => sum + Math.abs(p.weightPct), 0);
  const projected = existing + requestedWeightPct;

  return [
    check("sector_known", true, `${c.ticker} is ${c.sector} (group: ${group})`),
    check(
      "sector_concentration",
      projected <= cap,
      `${group} would be ${projected.toFixed(1)}% (${existing.toFixed(1)}% held ` +
        `+ ${requestedWeightPct.toFixed(1)}% new) vs ${cap}% cap`
    ),
  ];
}

/**
 * Can the book close this position?
 *
 * The min-hold rail exists to stop churn, but it must never trap the book in a
 * position whose thesis has already been disproven — so an invalidation breach
 * and a risk-rail breach both override it. Only a discretionary exit (the crew
 * changed its mind on a blind re-underwrite) has to serve the minimum.
 */
export function checkExit(
  m: Mandate,
  reason: "invalidation" | "risk_rail" | "reunderwrite",
  heldTradingDays: number
): MandateVerdict {
  const overrides = reason === "invalidation" || reason === "risk_rail";
  const checks = [
    check(
      "min_hold_days",
      overrides || heldTradingDays >= m.minHoldDays,
      overrides
        ? `${reason} overrides the ${m.minHoldDays}-day minimum`
        : `held ${heldTradingDays}d vs ${m.minHoldDays}d minimum`
    ),
  ];
  const allowed = checks.every((k) => k.passed);
  return { allowed, checks, allowedWeightPct: 0 };
}

/**
 * Positions that have drifted past the hard cap and must be trimmed back to the
 * entry cap. Drift is a consequence of the book working — a winner grows — so
 * this trims to `maxEntryWeightPct` rather than closing the position.
 */
export function positionsNeedingTrim(
  m: Mandate,
  positions: LivePosition[]
): { ticker: string; weightPct: number; trimToPct: number }[] {
  return positions
    .filter((p) => Math.abs(p.weightPct) > m.maxDriftWeightPct)
    .map((p) => ({
      ticker: p.ticker,
      weightPct: p.weightPct,
      trimToPct: m.maxEntryWeightPct,
    }));
}

export interface DrawdownState {
  highWaterMark: number;
  drawdownPct: number;
  /** True the day the rail trips AND on every frozen day after it. */
  frozen: boolean;
  /** Trading days of freeze remaining, including today. */
  freezeDaysRemaining: number;
  /** True only on the day the rail newly trips — the day that owes a review. */
  tripped: boolean;
}

/**
 * Update the high-water mark and the drawdown freeze.
 *
 * `freezeDaysRemaining` is carried by the caller from yesterday's snapshot and
 * decremented here, so the freeze counts TRADING days rather than calendar days
 * — a weekend must not quietly serve the penalty.
 */
export function evaluateDrawdown(
  m: Mandate,
  equity: number,
  priorHighWaterMark: number,
  priorFreezeDaysRemaining: number
): DrawdownState {
  const highWaterMark = Math.max(priorHighWaterMark, equity);
  const drawdownPct =
    highWaterMark > 0 ? ((highWaterMark - equity) / highWaterMark) * 100 : 0;

  const carried = Math.max(0, priorFreezeDaysRemaining - 1);
  const tripped = drawdownPct >= m.drawdownFreezePct && carried === 0;
  const freezeDaysRemaining = tripped ? m.drawdownFreezeDays : carried;

  return {
    highWaterMark,
    drawdownPct,
    frozen: freezeDaysRemaining > 0,
    freezeDaysRemaining,
    tripped,
  };
}

/**
 * Reconcile the funded account against the mandate it will be judged under.
 *
 * Called at INCEPTION only. The mandate is frozen at launch and republished with
 * every decision, so a book running under different capital than it declares
 * makes its own sizing rails a misstatement — a 3% floor and a 12% cap describe
 * different dollar amounts than the reader is being shown. Caught on the first
 * real run: a $100k Alpaca paper account against a $10k declared mandate, which
 * also reported a 900% return on day one.
 *
 * Tolerance is 1%, not zero: a paper account can carry trivial interest accrual,
 * and failing a launch over $3 would be theatre.
 */
export function checkInceptionEquity(
  m: Mandate,
  brokerEquity: number
): { matches: boolean; driftPct: number; declared: number; actual: number } {
  const declared = m.startingEquity;
  const driftPct = declared > 0 ? Math.abs((brokerEquity - declared) / declared) * 100 : Infinity;
  return { matches: driftPct <= 1, driftPct, declared, actual: brokerEquity };
}
