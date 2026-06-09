#!/usr/bin/env bash
# markov-refresh.sh — Pre-warm Markov regime cache for SPY, QQQ, DIA
# Runs nightly at 6:30 AM ET via cron. Calls the local API if the app
# is running; if not, runs the Python skill directly and saves to DB
# via the api/markov route on next app startup (results cached in SQLite).

set -euo pipefail

LOG_DIR="$HOME/Library/Logs/Finava"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/markov-refresh.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting Markov nightly refresh..." >> "$LOG"

# ── Try the live API first (app running on port 3000) ──────────────────────
if curl -sf --max-time 5 "http://localhost:3000/api/markov?tickers=SPY,QQQ,DIA&years=5&force=1" \
     -o /dev/null 2>/dev/null; then
  echo "[$TIMESTAMP] ✓ API cache pre-warm successful via http://localhost:3000" >> "$LOG"
  exit 0
fi

echo "[$TIMESTAMP] App not running — running Python skill directly..." >> "$LOG"

# ── App offline: run the Markov Python skill directly ─────────────────────
export PATH="$HOME/.local/bin:$PATH"
SKILL_DIR="$HOME/.claude/skills/markov-hedge-fund-method"

if [ ! -d "$SKILL_DIR" ]; then
  echo "[$TIMESTAMP] ✗ Skill not found at $SKILL_DIR" >> "$LOG"
  exit 1
fi

for TICKER in SPY QQQ DIA; do
  echo "[$TIMESTAMP]   Running $TICKER..." >> "$LOG"
  OUTPUT=$(cd "$SKILL_DIR" && uv run python -m markov_hedge_fund_method.run \
    --ticker "$TICKER" --years 5 2>&1)

  # Save raw output next to the log so next app startup can load it
  echo "$OUTPUT" > "$LOG_DIR/markov_${TICKER}_latest.txt"
  echo "[$TIMESTAMP]   ✓ $TICKER complete" >> "$LOG"
done

echo "[$TIMESTAMP] Done. Results saved to $LOG_DIR. DB will be updated on next app start." >> "$LOG"
