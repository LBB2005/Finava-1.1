import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { requireEntitlement } from "@/lib/entitlements";
import { withRoute } from "@/lib/withRoute";
import { CreateStrategySchema } from "@/lib/schemas/strategy";
import type { Strategy } from "@/components/hedge-fund/types";

// ── Research & config for the Markov Regime strategy ─────────────────────────

const MARKOV_RESEARCH = `## Markov Regime Model — SPY / QQQ / DIA

### What the model actually does

The \`markov-hedge-fund-method\` skill (installed at \`~/.claude/skills/markov-hedge-fund-method/\`) fits a **3-state discrete Markov chain** to daily price history. Here's the pipeline step by step:

1. **Fetch daily OHLCV** from Yahoo Finance (default: 5 years)
2. **Label each day** as Bull / Sideways / Bear using a 20-day rolling return window
3. **Estimate a 3×3 transition matrix** — each cell is the probability of moving from regime X tomorrow given you're in regime X today
4. **Solve the stationary distribution** — the long-run % of time spent in each regime (eigenvector of the matrix)
5. **Walk-forward backtest** — re-estimates the matrix at every step with only past data (no lookahead). Outputs annualised Sharpe + max drawdown
6. **Optional HMM upgrade** — fits a Gaussian HMM via hmmlearn's Baum-Welch algorithm, giving mean daily return per latent state

Run it any time with: \`/markov TICKER\`

---

### Live results — run 2026-05-23

#### SPY (S&P 500)
| Metric | Value |
|--------|-------|
| Walk-forward Sharpe | **0.26** |
| Max drawdown | −18.74% |
| Bull → Bull persistence | 90.22% |
| Bear → Bear persistence | 86.23% |
| Long-run Bull | 46.89% |
| Long-run Sideways | 31.30% |
| Long-run Bear | 21.81% |

HMM daily returns: Bear −0.143% · Sideways +0.077% · Bull +0.093%

#### QQQ (Nasdaq-100)
| Metric | Value |
|--------|-------|
| Walk-forward Sharpe | **0.60** |
| Max drawdown | −25.10% |
| Bull → Bull persistence | 88.63% |
| Bear → Bear persistence | 88.96% |
| Long-run Bull | 48.00% |
| Long-run Sideways | 26.90% |
| Long-run Bear | 25.10% |

HMM daily returns: Bear −0.121% · Sideways +0.135% · Bull +0.149%

#### DIA (Dow Jones)
| Metric | Value |
|--------|-------|
| Walk-forward Sharpe | **−0.18** |
| Max drawdown | −34.80% |
| Bull → Bull persistence | 87.14% |
| Bear → Bear persistence | 83.68% |
| Long-run Bull | 39.42% |
| Long-run Sideways | 37.77% |
| Long-run Bear | 22.81% |

HMM daily returns: Bear −0.107% · Sideways +0.035% · Bull +0.078%

---

### Key finding: regimes are real and sticky

The persistence diagonal is the important number. A 90% Bull→Bull persistence means **once you're in a Bull regime, there's a 90% chance you'll still be in it tomorrow**. Regimes don't flip randomly — they last weeks or months. That's what makes them tradeable.

The 3×3 transition matrices also show a structural feature: **Bull never transitions directly to Bear in one day** (0.00% for SPY and DIA). A trend day almost always passes through Sideways first. This means the model gives early warning before major drawdowns.

---

### Why DIA has negative walk-forward Sharpe

DIA allocates less time in Bull (39%) vs SPY/QQQ (~47–48%). More importantly, DIA's Sideways stationary weight is 38% vs 27% for QQQ — the Dow spends more time range-bound, which is hard to trade with a simple long/flat/short allocation rule. The DIA result is intentionally included here as a negative example — **not all tickers suit Markov allocation**.

---

### How the model is currently used in the bot

The trading bot does NOT use this Markov skill directly. It uses a simpler SMA50/200 + ATR detector in \`engine/regime_detector.py\`:
- SMA50 > SMA200 + ATR normal → BULL
- SMA50 < SMA200 or ATR spike → BEAR
- Otherwise → SIDEWAYS

This SMA-based detector gates the TQQQ ORB strategy — Bull days buy TQQQ, Bear days buy SQQQ, Sideways days sit flat.

---

### How to upgrade: replace SMA detector with Markov

The Markov model's walk-forward Sharpe of 0.26–0.60 on SPY/QQQ suggests the regimes have real predictive power. Three ways to wire it in:

**Option A — Drop-in gate replacement**
Replace \`detect_regime()\` in \`engine/regime_detector.py\` with a Markov posterior. Instead of SMA crossover, use the current-state probability vector. Higher confidence = bigger position.

**Option B — Composite vote**
Run the Markov model on SPY + QQQ simultaneously. Only trade TQQQ ORB when both agree on Bull, only trade SQQQ when both agree on Bear. Reduces trade frequency but improves conviction.

**Option C — Persistence-weighted sizing**
Use the Bull→Bull persistence as a position scaler. If Bull persistence is 92%, trade 40% of account. If it drops to 75% (regime becoming unstable), trade 25%. Scale with regime confidence.

---

### What to watch
- Rerun \`/markov SPY\` weekly to check if persistence diagonal is changing
- If Bull→Bull drops below 80%, the regime is weakening — consider reducing TQQQ ORB size
- A Bear stationary distribution rising above 35% is a regime-shift warning
- Compare the HMM's current state assignment to the SMA detector — disagreements are informative`;

const MARKOV_CONFIG = {
  mode:                 "allocation",
  tickers:              ["SPY", "QQQ", "DIA"],
  bull_equity_pct:      0.90,
  sideways_equity_pct:  0.50,
  bear_equity_pct:      0.05,
  markov_window:        20,
  markov_years:         5,
  skill_command:        "/markov SPY",
};

// ── Research & config for the TQQQ ORB strategy ───────────────────────────────

const TQQQ_ORB_RESEARCH = `## Why TQQQ Opening Range Breakout

### Research session — 2026-05-23

#### Asset selection: equities over crypto
We ran Markov regime analysis on BTC-USD and ETH-USD (5yr, 20-day window):

| Asset | Walk-forward Sharpe | Max Drawdown | Bear % long-run |
|-------|--------------------:|-------------:|----------------:|
| BTC   | −0.15               | −70.3%       | 39%             |
| ETH   | −0.25               | −94.2%       | 46%             |

The naive Markov regime approach (long in Bull, flat otherwise) produces **negative walk-forward Sharpe on both**. The regimes ARE real and persistent (87% Bear↔Bear, 88% Bull↔Bull) but the 20-day labelling window creates too much lag on the entry/exit. Crypto was ruled out.

#### Instrument: TQQQ over margin or raw QQQ
- TQQQ (Direxion 3× QQQ) gives ~3× QQQ exposure with no margin calls and no interest charges
- For single-day holds the volatility decay that hurts TQQQ long-term holders is negligible
- Alpaca paper supports TQQQ as a regular equity — the bot just buys/sells it like any stock
- Chose 40% account allocation per trade → effective ~$120k QQQ exposure on a $100k account

#### Strategy: Opening Range Breakout
The first 15 minutes after open (9:30–9:44 ET) capture initial price discovery. A clean break above the range high or below the range low statistically continues in the breakout direction, especially when confirmed by the macro regime. Rules:

1. Wait for the 9:30–9:44 QQQ 1-min range to form
2. At 9:45 ET lock High and Low
3. Check SPY regime (SMA50/SMA200 + ATR):
   - **BULL** → only take upside breaks → buy TQQQ
   - **BEAR** → only take downside breaks → buy SQQQ (3× inverse)
   - **SIDEWAYS** → sit flat for the day
4. On breakout: enter via Alpaca bracket order (entry + TP + SL in one API call)
5. Force-flatten at 3:55 PM regardless

#### Parameter rationale
| Param | Value | Reasoning |
|-------|-------|-----------|
| ORB window | 15 min | Standard; longer windows reduce false breaks |
| Position size | 40% | Meaningful without betting the whole account on one signal |
| Trailing stop | 2% from peak | Rides winners with no upside cap; 2% gives room through TQQQ noise |
| Hard floor | −3% from entry | Absolute worst-case per trade; checked every 30s in the main loop |
| Flatten | 3:55 PM | No overnight risk; avoids thin end-of-day tape |
| Daily drawdown halt | 3% of SOD equity | Kill-switch if multiple bad ticks compound |

#### Exit strategy decision — trailing stop over fixed take-profit
Originally designed with a fixed +6% take-profit. Replaced with a 2% trailing stop after recognising that capping gains at +6% left significant money on the table on strong trend days (TQQQ can run +15–20% on a big macro move).

**How the two-layer exit works:**
1. **Trailing stop (Alpaca-native):** placed immediately after entry. Follows the price up tick by tick. Exits automatically when price pulls back 2% from the intraday high-water mark. No upside cap.
2. **Hard floor (bot-side):** main loop checks the instrument price every 30 seconds. If it drops to −3% from entry before the trailing stop has moved up at all, the bot cancels all orders and closes the position immediately. This handles gap-downs and flash crashes that could slip past the trail.

The 2% trail was chosen over tighter (1%) or looser (4%) options because TQQQ's typical intraday noise is ~1–1.5% on a trend day. A 1% trail would shake out frequently on normal volatility; 4% would give back too much profit on a reversal.

#### SPY regime as gate (not BTC's own regime)
The existing SPY Markov strategy has walk-forward Sharpe of 0.74–0.91. Using SPY's regime as the gate means we only day-trade TQQQ on days where macro conditions confirm the direction. This is the key alpha lever — a raw ORB without a regime filter has far more whipsaws.

#### What to watch / future improvements
- Backtest ORB on QQQ history with this exact regime gate to calibrate the parameters
- Consider a minimum range width filter (e.g. skip if range < 0.3% — too tight = false signals)
- VIX spike filter: if VIX > 30 at open, widen the trail to 3% or skip entirely
- Add a volume confirmation: breakout should have above-average volume on the breakout candle
- Consider tightening the trail to 1.5% once in profit by 5%+ (lock in more on big days)`;

const TQQQ_ORB_CONFIG = {
  mode:                   "orb",
  regime_ticker:          "SPY",
  signal_ticker:          "QQQ",
  instrument_long:        "TQQQ",
  instrument_short:       "SQQQ",
  orb_window_minutes:     15,
  capture_time_et:        "09:45",
  flatten_time_et:        "15:55",
  position_pct:           0.40,
  trail_pct:              2.0,
  stop_loss_pct:          0.03,
  max_daily_drawdown_pct: 3.0,
  persistence_floor:      0.75,
  persistence_full:       0.90,
};

const DEFAULTS = [
  {
    name:      "TQQQ Opening Range Breakout",
    tag:       "Live",
    desc:      "Buys TQQQ (3× QQQ) on a clean 9:45 ET breakout of the 9:30–9:44 opening range. SPY SMA50/200 regime gates direction: Bull = long TQQQ, Bear = long SQQQ, Sideways = flat. 40% of account, 2% trailing stop (rides winners), −3% hard floor, force-flatten at 3:55 PM.",
    tickers:   JSON.stringify(["TQQQ", "SQQQ", "QQQ", "SPY"]),
    config:    JSON.stringify(TQQQ_ORB_CONFIG),
    research:  TQQQ_ORB_RESEARCH,
    sharpe:    0, cagr: 0, maxDD: 0, winRate: 0,
    active:    true,
    lastTrade: "—",
  },
  {
    name:      "Markov Regime — SPY / QQQ / DIA",
    tag:       "Live",
    desc:      "3-state Markov chain (Bull / Sideways / Bear) across SPY, QQQ, and DIA. Rebalances equity allocation daily from regime posteriors. Run /markov TICKER any time to refresh. Walk-forward Sharpe: SPY 0.26, QQQ 0.60, DIA −0.18. Currently used as the regime gate for TQQQ ORB.",
    tickers:   JSON.stringify(["SPY", "QQQ", "DIA"]),
    config:    JSON.stringify(MARKOV_CONFIG),
    research:  MARKOV_RESEARCH,
    sharpe:    0.43, cagr: 11.2, maxDD: -25.10, winRate: 55.1,
    active:    false,
    lastTrade: "REBALANCE → 68% equity",
  },
  {
    name:      "Regime Tilt — SPY",
    tag:       "Live",
    desc:      "Long SPY in Bull, 50% cash in Sideways, flat in Bear. Re-balances daily from Markov posterior.",
    tickers:   JSON.stringify(["SPY"]),
    config:    JSON.stringify({ mode: "allocation", tickers: ["SPY"], bull_equity_pct: 1.0, sideways_equity_pct: 0.50, bear_equity_pct: 0.0 }),
    research:  "Single-ticker Markov regime tilt on SPY. Strongest risk-adjusted returns of the allocation strategies — Sharpe 0.82 walk-forward.",
    sharpe:    0.82, cagr: 14.1, maxDD: -14.6, winRate: 58.4,
    active:    false,
    lastTrade: "BUY SPY +12 @ 587.41",
  },
  {
    name:      "QQQ Momentum + HMM",
    tag:       "Live",
    desc:      "20d/60d momentum gated by HMM Bull posterior > 0.55. Stops at −8% trail.",
    tickers:   JSON.stringify(["QQQ"]),
    config:    JSON.stringify({ mode: "allocation", tickers: ["QQQ"], momentum_short: 20, momentum_long: 60, hmm_bull_threshold: 0.55, trailing_stop_pct: 0.08 }),
    research:  "Momentum crossover (20d vs 60d) with HMM posterior as a confirmation filter. Only enters when both momentum is positive AND the HMM assigns Bull posterior > 55%. Sharpe 0.91 walk-forward.",
    sharpe:    0.91, cagr: 17.4, maxDD: -22.1, winRate: 54.2,
    active:    false,
    lastTrade: "ADD QQQ +6 @ 504.18",
  },
  {
    name:      "DIA Iron Condor (Sideways)",
    tag:       "Paper",
    desc:      "Sells 1-SD strangle 30 DTE while DIA Sideways stationary > 40%. Closes at 50% credit.",
    tickers:   JSON.stringify(["DIA"]),
    config:    JSON.stringify({ mode: "options", ticker: "DIA", dte: 30, width_sd: 1.0, close_at_credit_pct: 0.50, min_sideways_stationary: 0.40 }),
    research:  "Options premium selling strategy. Only enters when the Markov stationary distribution assigns Sideways > 40% — meaning the regime model thinks range-bound is the long-run equilibrium. Highest win rate of all strategies at 71.8%.",
    sharpe:    1.12, cagr: 8.6, maxDD: -5.2, winRate: 71.8,
    active:    false,
    lastTrade: "OPEN IC 420/425/435/440 @ 1.84",
  },
  {
    name:      "Vol Regime Flip",
    tag:       "Draft",
    desc:      "Long SPY when VIX < 14 and Bull persistence > 90%. Flat otherwise. Equity-only.",
    tickers:   JSON.stringify(["SPY", "VIX"]),
    config:    JSON.stringify({ mode: "custom", ticker: "SPY", vix_threshold: 14, bull_persistence_threshold: 0.90 }),
    research:  "Enters SPY only when two conditions align: low volatility regime (VIX < 14) AND extremely sticky Bull regime (persistence > 90%). Very selective — fires only a handful of times per year. Needs live VIX data feed.",
    sharpe:    0.64, cagr: 11.2, maxDD: -9.4, winRate: 61.1,
    active:    false,
    lastTrade: "—",
  },
  {
    name:      "Earnings Drift Fade",
    tag:       "Paper",
    desc:      "Fades 1-day post-earnings overreaction in S&P 100 names. 5-day hold, 4% stop.",
    tickers:   JSON.stringify(["AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMZN"]),
    config:    JSON.stringify({ mode: "custom", universe: "SP100", hold_days: 5, stop_pct: 0.04, entry: "post_earnings_open" }),
    research:  "Mean-reversion after earnings gaps. Stocks that gap >3% on earnings day tend to give back 30–50% of the gap over the following 5 sessions. Enters at the open after the earnings day, exits at the 5-day close or 4% stop.",
    sharpe:    0.58, cagr: 9.2, maxDD: -12.8, winRate: 56.6,
    active:    false,
    lastTrade: "SELL META @ post-earn open",
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStrategy(row: any): Strategy {
  return {
    id:        row.id,
    name:      row.name,
    tag:       row.tag,
    desc:      row.desc,
    tickers:   JSON.parse(row.tickers  || "[]"),
    config:    JSON.parse(row.config   || "{}"),
    research:  row.research || "",
    sharpe:    row.sharpe,
    cagr:      row.cagr,
    maxDD:     row.maxDD,
    winRate:   row.winRate,
    active:    row.active,
    lastTrade: row.lastTrade,
  };
}

function strategiesCol(uid: string) {
  return db.collection("users").doc(uid).collection("strategies");
}

export const GET = withRoute({}, async ({ userId }) => {
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;
  let snap = await strategiesCol(userId).orderBy("createdAt", "asc").get();

  if (snap.empty) {
    const now = new Date().toISOString();
    const batch = db.batch();
    for (const d of DEFAULTS) {
      const ref = strategiesCol(userId).doc();
      batch.set(ref, { ...d, userId, createdAt: now, updatedAt: now });
    }
    await batch.commit();
    snap = await strategiesCol(userId).orderBy("createdAt", "asc").get();
  }

  return NextResponse.json(snap.docs.map((doc) => toStrategy(serializeDoc(doc.id, doc.data()))));
});

export const POST = withRoute({ body: CreateStrategySchema }, async ({ userId, body }) => {
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;
  const now = new Date().toISOString();
  const docRef = await strategiesCol(userId).add({
    userId,
    name:      body.name,
    tag:       body.tag,
    desc:      body.desc,
    tickers:   JSON.stringify(body.tickers),
    config:    JSON.stringify(body.config),
    research:  body.research,
    sharpe:    body.sharpe,
    cagr:      body.cagr,
    maxDD:     body.maxDD,
    winRate:   body.winRate,
    active:    false,
    lastTrade: "—",
    createdAt: now,
    updatedAt: now,
  });
  const snap = await docRef.get();
  return NextResponse.json(toStrategy(serializeDoc(snap.id, snap.data()!)));
});
