#!/bin/bash
# start.sh — Start Youbot Core (Backend API + Next.js UI on port 5080)
set -e
ulimit -n 65536 2>/dev/null || true

DIR="$(cd "$(dirname "$0")/youbot-core" && pwd)"

# Clear stale Turbopack cache (prevents EMFILE on restart)
rm -rf "$DIR/web-ui/.next"

echo "🛑 Killing any existing processes..."
# Kill by saved PID files (and their process groups)
for pidfile in "$DIR/youbot.pid" "$DIR/web-ui.pid"; do
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    # Kill the entire process group
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    rm -f "$pidfile"
  fi
done
# Kill by port (catches any stragglers)
lsof -ti:5080 | xargs kill -9 2>/dev/null || true
lsof -ti:5081 | xargs kill -9 2>/dev/null || true
# Kill zombie child processes by pattern
pkill -9 -f 'tsx watch src/index.ts' 2>/dev/null || true
pkill -9 -f 'concurrently.*dev:server.*dev:css' 2>/dev/null || true
pkill -9 -f 'tailwindcss.*input.css.*output.css.*watch' 2>/dev/null || true
sleep 1

# 1) Start backend API on internal port 5081
echo "🔧 Building backend API..."
cd "$DIR"
npm run build

echo "🔧 Starting backend API on :5081 (Production Mode)..."
SURL="http://127.0.0.1:54321"
SKEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
SANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

PORT=5081 SUPABASE_URL="$SURL" SUPABASE_SERVICE_ROLE_KEY="$SKEY" nohup bash -c 'ulimit -n 65536 2>/dev/null; exec npm start' > "$DIR/youbot.log" 2>&1 &
echo $! > "$DIR/youbot.pid"

# 2) Start Next.js UI on port 5080 (user-facing)
echo "🎨 Building Next.js UI..."
cd "$DIR/web-ui"
npm run build

echo "🎨 Starting Next.js UI on :5080 (Production Mode)..."
PORT=5080 NEXT_PUBLIC_SUPABASE_URL="$SURL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$SANON" nohup bash -c 'ulimit -n 65536 2>/dev/null; exec npm start' > "$DIR/web-ui.log" 2>&1 &
echo $! > "$DIR/web-ui.pid"

sleep 4
echo ""
echo "✅ Youbot Core running!"
echo "📊 Dashboard: http://localhost:5080"
echo "📄 Logs: tail -f $DIR/youbot.log $DIR/web-ui.log"
