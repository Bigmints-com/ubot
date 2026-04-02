#!/bin/bash
# start.sh — Start Ubot Core (Backend API + Next.js UI on port 4080)
set -e
ulimit -n 65536 2>/dev/null || true

DIR="$(cd "$(dirname "$0")/ubot-core" && pwd)"

# Clear stale Turbopack cache (prevents EMFILE on restart)
rm -rf "$DIR/web-ui/.next"

echo "🛑 Killing any existing processes..."
# Kill by saved PID files (and their process groups)
for pidfile in "$DIR/ubot.pid" "$DIR/web-ui.pid"; do
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    # Kill the entire process group
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    rm -f "$pidfile"
  fi
done
# Kill by port (catches any stragglers)
lsof -ti:4080 | xargs kill -9 2>/dev/null || true
lsof -ti:4081 | xargs kill -9 2>/dev/null || true
# Kill zombie child processes by pattern
pkill -9 -f 'tsx watch src/index.ts' 2>/dev/null || true
pkill -9 -f 'concurrently.*dev:server.*dev:css' 2>/dev/null || true
pkill -9 -f 'tailwindcss.*input.css.*output.css.*watch' 2>/dev/null || true
sleep 1

# 1) Start backend API on internal port 4081
echo "🔧 Starting backend API on :4081..."
cd "$DIR"
SURL="http://127.0.0.1:54321"
SKEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
SANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

PORT=4081 SUPABASE_URL="$SURL" SUPABASE_SERVICE_ROLE_KEY="$SKEY" nohup bash -c 'ulimit -n 65536 2>/dev/null; exec npm run dev' > "$DIR/ubot.log" 2>&1 &
echo $! > "$DIR/ubot.pid"

# 2) Start Next.js UI on port 4080 (user-facing)
echo "🎨 Starting Next.js UI on :4080 (Turbopack)..."
cd "$DIR/web-ui"
PORT=4080 WATCHPACK_POLLING=true NEXT_PUBLIC_SUPABASE_URL="$SURL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$SANON" nohup bash -c 'ulimit -n 65536 2>/dev/null; exec npm run dev' > "$DIR/web-ui.log" 2>&1 &
echo $! > "$DIR/web-ui.pid"

sleep 4
echo ""
echo "✅ Ubot Core running!"
echo "📊 Dashboard: http://localhost:4080"
echo "📄 Logs: tail -f $DIR/ubot.log $DIR/web-ui.log"
