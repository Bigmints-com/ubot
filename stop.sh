#!/bin/bash
# stop.sh — Stop Youbot Core (graceful shutdown)
set -e

DIR="$(cd "$(dirname "$0")/youbot-core" && pwd)"

echo "🛑 Stopping Youbot Core..."

GRACE_PERIOD=15  # seconds to wait for graceful shutdown

# Gracefully stop PID-tracked processes
for PID_FILE in "$DIR/youbot.pid" "$DIR/web.pid"; do
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "   Sending SIGTERM to PID $PID..."
      kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
done

# Send SIGTERM to processes on the ports (graceful first)
for PORT in 5080 5081; do
  PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "   Sending SIGTERM to PIDs on port $PORT: $PIDS"
    echo "$PIDS" | xargs kill -TERM 2>/dev/null || true
  fi
done

# Wait for graceful shutdown
echo "   Waiting up to ${GRACE_PERIOD}s for graceful shutdown..."
SLEEPED=0
while [ $SLEEPED -lt $GRACE_PERIOD ]; do
  # Check if any processes remain on the ports
  REMAINING=$(lsof -ti:5080 -ti:5081 2>/dev/null || true)
  if [ -z "$REMAINING" ]; then
    break
  fi
  sleep 1
  SLEEPED=$((SLEEPED + 1))

  # Show progress every 5 seconds
  if [ $((SLEEPED % 5)) -eq 0 ]; then
    echo "   Still waiting... (${SLEEPED}/${GRACE_PERIOD}s)"
  fi
done

# Force kill anything still running
REMAINING=$(lsof -ti:5080 -ti:5081 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo "   Processes still running after ${GRACE_PERIOD}s — force killing..."
  echo "$REMAINING" | xargs kill -9 2>/dev/null || true
fi

echo "✅ Youbot Core stopped"
