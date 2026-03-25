# Remote Server Deployment

*Added: March 2026. Documents VPS deployment for production UBOT instances.*

## Server Details

| Item | Value |
|---|---|
| SSH Alias | `ubot-server` (configured in `~/.ssh/config`) |
| OS | Ubuntu 24.04 (Noble) |
| Node.js | v22.x |
| Runtime dir | `/root/.ubot/` |
| Source dir | `/root/ubot/` |
| Port | `11490` |
| Auth | SSH key (passwordless) |

## Quick Deploy (Remote)

After making changes locally, build and sync the compiled `dist/` to the server:

```bash
# 1. Build locally
npm run build --prefix ubot-core

# 2. Sync compiled lib
rsync -az ubot-core/dist/ ubot-server:/root/.ubot/lib/

# 3. Sync config/creds if changed
rsync -az ~/.ubot/config.json ~/.ubot/vertex-credentials.json ubot-server:/root/.ubot/

# 4. Restart
ssh ubot-server "export PATH=\$PATH:/root/.local/bin && ubot restart"

# 5. Verify
ssh ubot-server "ubot logs | tail -10"
```

> **Do NOT rsync `web/`, `node_modules/`, or `data/`** — these are huge and not needed.

## First-Time Setup

If the server has no UBOT install:

```bash
# Install Node.js 22
ssh ubot-server "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"

# Sync source (excluding heavy dirs)
rsync -az --exclude='node_modules' --exclude='.git' --exclude='ubot-core/web' \
  --exclude='ubot-core/dist' /path/to/ubot/ ubot-server:/root/ubot/

# Sync web source separately (no .next cache)
rsync -az --exclude='.next' --exclude='node_modules' ubot-core/web/ ubot-server:/root/ubot/ubot-core/web/

# Install deps on server
ssh ubot-server "cd /root/ubot/ubot-core && npm install && cd web && npm install"

# Build & install
ssh ubot-server "cd /root/ubot && make install"

# If already installed, use update
ssh ubot-server "cd /root/ubot && make update"
```

## Port Configuration

Always confirm UBOT runs on port **11490** on the server. If it starts on 11491 it means port 11490 is occupied:

```bash
ssh ubot-server "python3 -c \"
import json
with open('/root/.ubot/config.json') as f: c = json.load(f)
c.setdefault('server', {})['port'] = 11490
with open('/root/.ubot/config.json', 'w') as f: json.dump(c, f, indent=4)
\" && ubot restart"
```

## Multiple Instance Prevention

Only one UBOT instance should run. If multiple `node` processes appear (e.g., after restarts), clean up:

```bash
ssh ubot-server "nohup sh -c 'pkill -f \"node.*index\"; sleep 3; /root/.local/bin/ubot start' > /tmp/restart.log 2>&1 &"
sleep 8
ssh ubot-server "ps aux | grep 'node.*index' | grep -v grep | wc -l"
```

Note: 3 node processes is normal (main + MCP children for Tavily/Playwright).

## Webchat Relay

The webchat relay is deployed separately on **Cloud Run** (europe-west1):

- **Service**: `ubot-webchat-relay`
- **URL**: `https://ubot-webchat-relay-q5uh5lc42q-ew.a.run.app`
- **Deploy**: `cd ubot-core && ./deploy-relay.sh`

UBOT's config must point `channels.webchat.relay_url` to this URL. UBOT polls the relay outbound (NAT-friendly — no inbound ports needed).

```json
{
  "channels": {
    "webchat": {
      "enabled": true,
      "relay_url": "https://ubot-webchat-relay-q5uh5lc42q-ew.a.run.app",
      "bot_secret": "<secret>",
      "auto_reply": true
    }
  }
}
```

## GCP Project

- **Project ID**: `saveaday-ai` (gen-lang-client-0951453139)
- **Vertex AI**: Global endpoint, `gemini-2.5-flash` family
- **Cloud Run**: `saveaday-ai` project, `europe-west1` region

## Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| `ETIMEDOUT` in Telegram logs | Normal long-poll drop | Self-recovers, ignore |
| `409 Conflict` in Telegram | Two UBOT instances running | Kill all, start one |
| Vertex 401 | Credentials not synced | `rsync vertex-credentials.json` |
| WhatsApp no session | Session not transferred | Scan QR via dashboard |
| Port 11491 instead of 11490 | Port conflict or config | Set `server.port = 11490` |
