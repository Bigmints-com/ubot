#!/bin/bash
#
# Deploy YOUBOT Webchat Relay to Google Cloud Run
#
# Usage:
#   ./deploy-relay.sh              # Deploy with defaults
#   ./deploy-relay.sh --secret XY  # Deploy with a specific bot secret
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - A GCP project with billing enabled
#

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RELAY_DIR="$SCRIPT_DIR/webchat-relay"
PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-europe-west1}"
SERVICE_NAME="youbot-webchat-relay"

# Parse args
BOT_SECRET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --secret) BOT_SECRET="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Generate a random secret if not provided. Reuse existing if found in YOUBOT config.
if [[ -z "$BOT_SECRET" ]]; then
  YOUBOT_CONFIG="$HOME/.youbot/config.json"
  if [[ -f "$YOUBOT_CONFIG" ]]; then
    EXISTING=$(python3 -c "import json; cfg=json.load(open('$YOUBOT_CONFIG')); print(cfg.get('channels',{}).get('webchat',{}).get('bot_secret',''))" 2>/dev/null || echo "")
    if [[ -n "$EXISTING" ]]; then
      BOT_SECRET="$EXISTING"
      echo "🔑 Reusing bot secret from config"
    fi
  fi
  if [[ -z "$BOT_SECRET" ]]; then
    BOT_SECRET=$(openssl rand -hex 16)
    echo "🔑 Generated new bot secret: $BOT_SECRET"
  fi
fi

# ── Validate ──────────────────────────────────────────────────────────────
if [[ -z "$PROJECT" ]]; then
  echo "❌ No GCP project set. Run: gcloud config set project YOUR_PROJECT"
  exit 1
fi

if [[ ! -d "$RELAY_DIR" ]]; then
  echo "❌ Relay directory not found: $RELAY_DIR"
  exit 1
fi

echo ""
echo "🌐 Deploying YOUBOT Webchat Relay"
echo "   Project:  $PROJECT"
echo "   Region:   $REGION"
echo "   Service:  $SERVICE_NAME"
echo ""

# ── Deploy ────────────────────────────────────────────────────────────────
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --source "$RELAY_DIR" \
  --project "$PROJECT" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "BOT_SECRET=$BOT_SECRET" \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 2 \
  --timeout 300 \
  --port 8080

# ── Get URL ───────────────────────────────────────────────────────────────
RELAY_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT" \
  --region "$REGION" \
  --format "value(status.url)" 2>/dev/null)

echo ""
echo "✅ Relay deployed successfully!"
echo ""
echo "   Relay URL:    $RELAY_URL"
echo "   Bot Secret:   $BOT_SECRET"
echo ""
echo "   ── Next Steps ──────────────────────────────────"
echo ""
echo "   1. Add to your YOUBOT config (~/.youbot/config.json):"
echo ""
echo "      \"channels\": {"
echo "        \"webchat\": {"
echo "          \"enabled\": true,"
echo "          \"relay_url\": \"$RELAY_URL\","
echo "          \"bot_secret\": \"$BOT_SECRET\""
echo "        }"
echo "      }"
echo ""
echo "   2. Or configure via the dashboard: Channels → Web Chat"
echo ""
echo "   3. Embed on any website:"
echo ""
echo "      <script src=\"$RELAY_URL/widget.js\""
echo "              data-server=\"$RELAY_URL\"></script>"
echo ""
echo "   4. Direct chat link: $RELAY_URL"
echo ""

# ── Auto-update YOUBOT config ──────────────────────────────────────────────
YOUBOT_CONFIG="$HOME/.youbot/config.json"
if [[ -f "$YOUBOT_CONFIG" ]]; then
  echo "📝 Updating YOUBOT config..."
  # Use python3 to merge webchat config
  python3 -c "
import json, sys
with open('$YOUBOT_CONFIG', 'r') as f:
    cfg = json.load(f)
if 'channels' not in cfg:
    cfg['channels'] = {}
if 'webchat' not in cfg['channels']:
    cfg['channels']['webchat'] = {}
cfg['channels']['webchat']['enabled'] = True
cfg['channels']['webchat']['relay_url'] = '$RELAY_URL'
cfg['channels']['webchat']['bot_secret'] = '$BOT_SECRET'
with open('$YOUBOT_CONFIG', 'w') as f:
    json.dump(cfg, f, indent=2)
print('   Updated ~/.youbot/config.json with webchat relay settings')
  "
  echo ""
  echo "   Restart YOUBOT to connect: youbot restart"
fi
