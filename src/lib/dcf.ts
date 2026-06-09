// Discounted-cash-flow model — pure functions shared by the DCF API route (which
// builds the base inputs from EDGAR/Finnhub) and the interactive DcfTab (which
// recomputes the fair value live as the user drags the WACC / growth sliders).
//
// Deliberately simple and transparent: a 5-year explicit free-cash-flow projection
// growing at `growth`, plus a Gordon-growth terminal value, discounted at `wacc`,
// less net debt, divided by shares outstanding. This is research color, not a
// precision valuation — capex data is sparse on EDGAR so `baseFcf` may fall back to
// operating cash flow (flagged via `fcfIsProxy`).

export interface DcfInputs {
  baseFcf: number | null; // latest annual free cash flow (USD)
  fcfIsProxy: boolean; // true when capex was unavailable and FCF == operating cash flow
  sharesOutstanding: number | null;
  netDebt: number | null; // total debt − cash (USD); can be negative (net cash)
  historicalGrowth: number | null; // revenue CAGR over available years, as a fraction (0.12 = 12%)
  suggestedWacc: number; // fraction (0.09 = 9%)
  currentPrice: number | null;
  currency: string | null;
}

export interface DcfResult {
  fairValue: number | null; // intrinsic value per share
  equityValue: number | null; // total equity value
  pvExplicit: number; // PV of the 5 explicit-period cash flows
  pvTerminal: number; // PV of the terminal value
  upsidePct: number | null; // vs currentPrice
}

export interface DcfAssumptions {
  wacc: number; // fraction
  growth: number; // explicit-period FCF growth, fraction
  years?: number; // explicit projection horizon (default 5)
  terminalGrowth?: number; // perpetual growth, fraction (default 0.025)
}

/** CAPM-flavoured WACC suggestion from beta. Risk-free 4% + beta·5% equity premium,
 *  clamped to a sane 7–13% band so a wild beta can't produce a nonsensical rate. */
export function suggestedWaccFromBeta(beta: number | null): number {
  const RISK_FREE = 0.04;
  const EQUITY_PREMIUM = 0.05;
  const b = beta != null && Number.isFinite(beta) ? beta : 1;
  const raw = RISK_FREE + b * EQUITY_PREMIUM;
  return Math.min(0.13, Math.max(0.07, raw));
}

/** Run the DCF. Returns nulls for fairValue/equityValue when inputs are insufficient
 *  (no FCF or no shares), but always returns the PV components it could compute. */
export function computeDcf(inputs: DcfInputs, a: DcfAssumptions): DcfResult {
  const years = a.years ?? 5;
  const terminalGrowth = a.terminalGrowth ?? 0.025;
  const { baseFcf, sharesOutstanding, netDebt, currentPrice } = inputs;

  // Terminal growth must sit below WACC or the Gordon denominator goes non-positive.
  const tg = Math.min(terminalGrowth, a.wacc - 0.005);

  if (baseFcf == null || baseFcf <= 0 || !Number.isFinite(a.wacc) || a.wacc <= 0) {
    return { fairValue: null, equityValue: null, pvExplicit: 0, pvTerminal: 0, upsidePct: null };
  }

  let pvExplicit = 0;
  let lastFcf = baseFcf;
  for (let t = 1; t <= years; t++) {
    lastFcf = lastFcf * (1 + a.growth);
    pvExplicit += lastFcf / Math.pow(1 + a.wacc, t);
  }

  // Terminal value at end of the explicit horizon, discounted back.
  const terminalFcf = lastFcf * (1 + tg);
  const terminalValue = terminalFcf / (a.wacc - tg);
  const pvTerminal = terminalValue / Math.pow(1 + a.wacc, years);

  const enterpriseValue = pvExplicit + pvTerminal;
  const equityValue = enterpriseValue - (netDebt ?? 0);

  const fairValue =
    sharesOutstanding && sharesOutstanding > 0 ? equityValue / sharesOutstanding : null;
  const upsidePct =
    fairValue != null && currentPrice && currentPrice > 0
      ? ((fairValue - currentPrice) / currentPrice) * 100
      : null;

  return { fairValue, equityValue, pvExplicit, pvTerminal, upsidePct };
}

/** Convenience: the fair value under the suggested/default assumptions. Used by the
 *  Finava synthesis to feed the three-way valuation comparison. */
export function defaultFairValue(inputs: DcfInputs): number | null {
  const growth =
    inputs.historicalGrowth != null
      ? Math.min(0.25, Math.max(0, inputs.historicalGrowth))
      : 0.08;
  return computeDcf(inputs, { wacc: inputs.suggestedWacc, growth }).fairValue;
}
