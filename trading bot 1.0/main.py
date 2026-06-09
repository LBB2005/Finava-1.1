"""
Finava Trading Bot — main loop orchestrator.

Strategy modes (set STRATEGY_MODE in config.py):
  "orb"        → TQQQ Opening Range Breakout (default)
  "allocation" → legacy SPY/QQQ/DIA regime allocation

ORB tick flow (every LOOP_INTERVAL_S seconds during market hours):
  1. Confirm market is open.
  2. Fetch SPY daily bars → detect regime (Bull / Sideways / Bear).
  3. Write status.json for the Next.js HFBot tab.

ORB scheduled events:
  MARKET_OPEN_ET  → lock start-of-day equity + reset ORB state
  ORB_CAPTURE_TIME → fetch QQQ 1-min bars, lock opening range
  ORB_FLATTEN_TIME → force-close all ORB positions
"""
from __future__ import annotations

import json
import logging
import os
import time
from collections import deque
from datetime import datetime, timedelta, timezone

import pytz
import schedule

from broker.alpaca_client import AlpacaClient
from config import (
    LOOP_INTERVAL_S,
    MARKET_CLOSE_ET,
    MARKET_OPEN_ET,
    ORB_CAPTURE_TIME,
    ORB_FLATTEN_TIME,
    ORB_PERSISTENCE_FLOOR,
    ORB_PERSISTENCE_FULL,
    ORB_REGIME_TICKER,
    ORB_SIGNAL_TICKER,
    STRATEGY_MODE,
    TICKERS,
)
from engine.regime_detector import Regime, detect_regime
from strategy.allocation import compute_allocation
from strategy.tqqq_orb import TQQQOrbStrategy

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

ET     = pytz.timezone("America/New_York")
client = AlpacaClient()

# ── Shared state ──────────────────────────────────────────────────────────────

_sod_equity:       float | None     = None
_sod_pnl_ref:      float | None     = None
_start_time:       datetime         = datetime.now(tz=timezone.utc)
_today_trades:     int              = 0
_bot_status:       str              = "Running"
_activity_log:     deque[dict]      = deque(maxlen=50)
_last_regime:      str              = "UNKNOWN"
_last_persistence: float            = 0.5     # Bull→Bull Markov persistence, updated each tick

STATUS_PATH = os.path.join(os.path.dirname(__file__), "status.json")

# ── ORB strategy instance ─────────────────────────────────────────────────────

_orb = TQQQOrbStrategy(client)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _et_now_str() -> str:
    return datetime.now(tz=ET).strftime("%H:%M:%S")


def _uptime_str() -> str:
    delta = datetime.now(tz=timezone.utc) - _start_time
    d, rem = divmod(int(delta.total_seconds()), 86400)
    h, rem = divmod(rem, 3600)
    m      = rem // 60
    return f"{d}d {h:02d}h {m:02d}m"


def _log_entry(lvl: str, msg: str) -> None:
    entry = {"ts": _et_now_str(), "lvl": lvl, "msg": msg}
    _activity_log.appendleft(entry)
    log.info("[%s] %s", lvl, msg)


def _write_status(
    current_equity: float | None = None,
    buying_power:   float | None = None,
    positions:      dict | None  = None,
) -> None:
    try:
        equity    = current_equity or (client.get_equity()       if _sod_equity else 0.0)
        bp        = buying_power   or (client.get_buying_power() if _sod_equity else 0.0)
        today_pnl = round(equity - _sod_pnl_ref, 2) if _sod_pnl_ref else 0.0
        cash_alloc = round(equity - bp / 2, 2)      if bp else 0.0

        strategies_active = 1 if STRATEGY_MODE == "orb" else len(TICKERS)

        payload = {
            "status":           _bot_status,
            "uptime":           _uptime_str(),
            "strategiesActive": strategies_active,
            "cashAllocated":    round(cash_alloc, 2),
            "cashFree":         round(bp / 2, 2),
            "todayTrades":      _today_trades,
            "todayPnL":         today_pnl,
            "schedule":         f"{MARKET_OPEN_ET} ET open · {ORB_FLATTEN_TIME} ET flatten",
            "lastHeartbeat":    f"{_et_now_str()} ET",
            "log":              list(_activity_log)[:30],
            "regimes":          {"SPY": _last_regime},
            "bullPersistence":  round(_last_persistence, 4),
            "positionScale":    round(_persistence_to_scale(_last_persistence), 4),
            "positions":        positions or {},
            "equity":           round(equity, 2),
            "orb":              _orb.status_dict() if STRATEGY_MODE == "orb" else {},
        }

        with open(STATUS_PATH, "w") as f:
            json.dump(payload, f)
    except Exception as exc:
        log.error("Failed to write status.json: %s", exc)


# ── Regime detection ──────────────────────────────────────────────────────────

def _persistence_to_scale(persistence: float) -> float:
    """
    Maps Bull→Bull persistence to a position-size multiplier (0–1).

      persistence >= ORB_PERSISTENCE_FULL  → 1.0  (full position)
      ORB_PERSISTENCE_FLOOR <= p < FULL    → linear ramp
      persistence <  ORB_PERSISTENCE_FLOOR → 0.0  (skip trade)
    """
    if persistence >= ORB_PERSISTENCE_FULL:
        return 1.0
    if persistence < ORB_PERSISTENCE_FLOOR:
        return 0.0
    return (persistence - ORB_PERSISTENCE_FLOOR) / (ORB_PERSISTENCE_FULL - ORB_PERSISTENCE_FLOOR)


def _get_regime() -> Regime:
    """Detect macro regime from SPY daily bars (SMA50/200 + ATR + Markov persistence)."""
    global _last_regime, _last_persistence
    ticker = ORB_REGIME_TICKER if STRATEGY_MODE == "orb" else TICKERS[0]
    try:
        bars   = client.get_bars(ticker, days=250)
        result = detect_regime(bars)
        _last_regime      = result.regime.value
        _last_persistence = result.bull_persistence
        _log_entry(
            "SIGNAL",
            f"{ticker} regime={result.regime.value}  "
            f"SMA50={result.short_ma:.2f}  SMA200={result.long_ma:.2f}  "
            f"conf={result.confidence:.2f}  "
            f"bull_persist={result.bull_persistence:.1%}",
        )
        return result.regime
    except Exception as exc:
        log.error("Regime detection failed: %s", exc)
        return Regime.SIDEWAYS   # safe default


# ── Scheduled callbacks ───────────────────────────────────────────────────────

def _on_market_open() -> None:
    global _sod_equity, _sod_pnl_ref
    _sod_equity  = client.get_equity()
    _sod_pnl_ref = _sod_equity
    _log_entry("INFO", f"SOD equity locked: ${_sod_equity:,.2f}")

    if STRATEGY_MODE == "orb":
        _orb.reset_for_new_day()

    _write_status(_sod_equity)


def _on_orb_capture() -> None:
    """
    Called at ORB_CAPTURE_TIME (09:45 ET).
    Fetches QQQ 1-min bars from 9:30–9:44 and locks the opening range.
    """
    if STRATEGY_MODE != "orb":
        return

    now_et    = datetime.now(tz=ET)
    orb_end   = now_et.replace(second=0, microsecond=0)
    orb_start = orb_end - timedelta(minutes=15)

    start_str = orb_start.isoformat()
    end_str   = orb_end.isoformat()

    _log_entry("INFO", f"Capturing ORB — {ORB_SIGNAL_TICKER} bars {start_str} → {end_str}")

    try:
        bars = client.get_intraday_bars(ORB_SIGNAL_TICKER, start_str, end_str)
        _orb.capture_orb(bars)
        if _orb.state.orb_locked:
            _log_entry(
                "SIGNAL",
                f"ORB locked — {ORB_SIGNAL_TICKER} H={_orb.state.orb_high:.2f}  "
                f"L={_orb.state.orb_low:.2f}",
            )
    except Exception as exc:
        log.error("[ORB] capture failed: %s", exc)


def _on_flatten() -> None:
    """Force-close all positions at EOD."""
    _log_entry("INFO", "EOD flatten — cancelling orders and closing all positions.")
    client.cancel_all_orders()
    client.close_all_positions()
    _write_status()


# ── ORB main tick ─────────────────────────────────────────────────────────────

def _tick_orb() -> None:
    global _today_trades, _sod_equity

    if not client.is_market_open():
        _log_entry("INFO", "Market closed — tick skipped.")
        _write_status()
        return

    if _sod_equity is None:
        _on_market_open()

    regime = _get_regime()

    # Daily drawdown guard
    current_equity = client.get_equity()
    if _sod_equity and _sod_equity > 0:
        dd_pct = (_sod_equity - current_equity) / _sod_equity * 100
        from config import MAX_DAILY_DRAWDOWN_PCT
        if dd_pct >= MAX_DAILY_DRAWDOWN_PCT:
            _log_entry(
                "RISK",
                f"DRAWDOWN LIMIT — equity ${current_equity:,.2f} vs SOD ${_sod_equity:,.2f} "
                f"({dd_pct:.1f}%). Closing all.",
            )
            client.cancel_all_orders()
            client.close_all_positions()
            _write_status(current_equity)
            return

    # Hard floor: if position is open and instrument has dropped -3% from entry,
    # cancel the trailing stop and close immediately (faster than waiting for
    # the 30s tick to catch a gap-down).
    if _orb.state.position_entered and _orb.state.instrument:
        try:
            inst_price = client.get_latest_price(_orb.state.instrument)
            if _orb.should_hard_stop(inst_price):
                _log_entry(
                    "RISK",
                    f"Hard floor hit — {_orb.state.instrument} @ ${inst_price:.2f}  "
                    f"floor=${_orb.state.hard_stop_price:.2f}  Closing.",
                )
                client.cancel_all_orders()
                client.close_all_positions()
                _write_status(current_equity)
                return
        except Exception as exc:
            log.error("[ORB] Hard floor check failed: %s", exc)

    # Persistence-weighted position scale (0–1)
    position_scale = _persistence_to_scale(_last_persistence)
    if position_scale == 0.0 and not _orb.state.position_entered and not _orb.state.skipped:
        _log_entry(
            "RISK",
            f"Bull persistence {_last_persistence:.1%} below floor "
            f"({ORB_PERSISTENCE_FLOOR:.0%}) — skipping ORB today.",
        )

    # Try ORB entry (no-op if range not locked yet, already entered, or skipped)
    trade_msg = _orb.check_entry(regime, current_equity, position_scale)
    if trade_msg:
        _log_entry("ORDER", trade_msg)
        _today_trades += 1

    buying_power  = client.get_buying_power()
    current_pos   = client.get_positions()
    _write_status(current_equity, buying_power, current_pos)


# ── Legacy allocation tick ────────────────────────────────────────────────────

def _tick_allocation() -> None:
    global _today_trades, _sod_equity

    if not client.is_market_open():
        _log_entry("INFO", "Market closed — tick skipped.")
        _write_status()
        return

    if _sod_equity is None:
        _on_market_open()

    latest_prices: dict[str, float] = {}
    regime_votes: list[Regime]      = []

    for ticker in TICKERS:
        try:
            bars   = client.get_bars(ticker, days=250)
            result = detect_regime(bars)
            _log_entry(
                "SIGNAL",
                f"{ticker} regime={result.regime.value}  "
                f"SMA50={result.short_ma:.2f}  SMA200={result.long_ma:.2f}",
            )
            regime_votes.append(result.regime)
            latest_prices[ticker] = float(bars["close"].iloc[-1])
        except Exception as exc:
            log.error("Error processing %s: %s", ticker, exc)

    if not regime_votes:
        _write_status()
        return

    regime         = max(set(regime_votes), key=regime_votes.count)
    current_equity = client.get_equity()
    buying_power   = client.get_buying_power()
    current_pos    = client.get_positions()

    plan = compute_allocation(
        regime=regime,
        tickers=TICKERS,
        current_equity=current_equity,
        start_of_day_equity=_sod_equity,  # type: ignore[arg-type]
        latest_prices=latest_prices,
    )

    if plan.drawdown_halted:
        _log_entry("RISK", "Drawdown limit hit — closing all.")
        client.cancel_all_orders()
        client.close_all_positions()
        _write_status(current_equity, buying_power, {})
        return

    for ticker, target_qty in plan.positions.items():
        current_qty = current_pos.get(ticker, 0.0)
        order_id    = client.reconcile_position(ticker, target_qty, current_qty)
        if order_id:
            side  = "BUY" if target_qty > current_qty else "SELL"
            delta = abs(round(target_qty - current_qty, 4))
            _log_entry("ORDER", f"{side} {ticker} x{delta} @ mkt  (order {order_id})")
            _today_trades += 1

    _write_status(current_equity, buying_power, current_pos)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    log.info("=" * 60)
    log.info(
        "Finava Trading Bot  |  PAPER  |  mode=%s  |  %s",
        STRATEGY_MODE,
        ORB_SIGNAL_TICKER if STRATEGY_MODE == "orb" else ", ".join(TICKERS),
    )
    log.info("=" * 60)

    acct = client.get_account_summary()
    log.info("Account: equity=$%.2f  buying_power=$%.2f", acct["equity"], acct["buying_power"])
    _log_entry(
        "INFO",
        f"Bot started. mode={STRATEGY_MODE}  NAV=${acct['equity']:,.2f}",
    )

    # Scheduled events
    schedule.every().day.at(MARKET_OPEN_ET).do(_on_market_open)

    if STRATEGY_MODE == "orb":
        schedule.every().day.at(ORB_CAPTURE_TIME).do(_on_orb_capture)
        schedule.every().day.at(ORB_FLATTEN_TIME).do(_on_flatten)
        schedule.every(LOOP_INTERVAL_S).seconds.do(_tick_orb)
        run_once = _tick_orb
    else:
        schedule.every().day.at(MARKET_CLOSE_ET).do(_on_flatten)
        schedule.every(LOOP_INTERVAL_S).seconds.do(_tick_allocation)
        run_once = _tick_allocation

    run_once()

    while True:
        schedule.run_pending()
        time.sleep(1)


if __name__ == "__main__":
    main()
