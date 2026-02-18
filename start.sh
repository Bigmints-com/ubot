#!/bin/bash
# start.sh — Start Ubot Core (Backend API + Next.js UI on port 4080)
set -e

DIR="$(cd "$(dirname "$0")/ubot-core" && pwd)"

echo "🛑 Killing any existing processes..."
lsof -ti:4080 | xargs kill -9 2>/dev/null || true
lsof -ti:4081 | xargs kill -9 2>/dev/null || true
sleep 1

# 1) Start backend API on internal port 4081
echo "🔧 Starting backend API on :4081..."
cd "$DIR"
PORT=4081 nohup npm run dev > "$DIR/ubot.log" 2>&1 &
echo $! > "$DIR/ubot.pid"

# 2) Start Next.js UI on port 4080 (user-facing)
echo "🎨 Starting Next.js UI on :4080 (Turbopack)..."
cd "$DIR/web"
PORT=4080 nohup npm run dev > "$DIR/web.log" 2>&1 &
echo $! > "$DIR/web.pid"

sleep 4
echo ""
echo "✅ Ubot Core running!"
echo "📊 Dashboard: http://localhost:4080"
echo "📄 Logs: tail -f $DIR/ubot.log $DIR/web.log"
