#!/bin/bash
# stop.sh — Stop Ubot Core
set -e

PORT=4080
DIR="$(cd "$(dirname "$0")/ubot-core" && pwd)"
PID_FILE="$DIR/ubot.pid"

echo "🛑 Stopping Ubot Core..."

# Try PID file first
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    echo "   Killed process $PID (from PID file)"
  fi
  rm -f "$PID_FILE"
fi

# Also kill anything on the port
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true

echo "✅ Ubot Core stopped"
