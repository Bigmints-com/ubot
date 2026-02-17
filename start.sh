#!/bin/bash
# start.sh — Start Ubot Core on port 4080
set -e

PORT=4080
DIR="$(cd "$(dirname "$0")/ubot-core" && pwd)"

echo "🛑 Killing any existing process on port $PORT..."
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
sleep 1

echo "🚀 Starting Ubot Core on port $PORT..."
cd "$DIR"
PORT=$PORT nohup npm run dev > "$DIR/ubot.log" 2>&1 &
PID=$!
echo $PID > "$DIR/ubot.pid"

sleep 3
if kill -0 $PID 2>/dev/null; then
  echo "✅ Ubot Core running (PID: $PID)"
  echo "📊 Dashboard: http://localhost:$PORT"
  echo "📄 Logs: tail -f $DIR/ubot.log"
else
  echo "❌ Failed to start. Check $DIR/ubot.log"
  exit 1
fi
