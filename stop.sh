#!/bin/bash
# stop.sh — Stop Ubot Core
set -e

DIR="$(cd "$(dirname "$0")/ubot-core" && pwd)"

echo "🛑 Stopping Ubot Core..."

for PID_FILE in "$DIR/ubot.pid" "$DIR/web.pid"; do
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    kill "$PID" 2>/dev/null && echo "   Killed PID $PID" || true
    rm -f "$PID_FILE"
  fi
done

lsof -ti:4080 | xargs kill -9 2>/dev/null || true
lsof -ti:4081 | xargs kill -9 2>/dev/null || true

echo "✅ Ubot Core stopped"
