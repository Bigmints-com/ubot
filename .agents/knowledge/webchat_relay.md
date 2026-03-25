# Webchat Relay Architecture

*Added: March 2026.*

## Overview

The webchat relay is a lightweight **Cloud Run Node.js server** that acts as a public broker between website visitors and a private UBOT instance (which may be behind NAT/firewall).

```
Visitor → relay (public Cloud Run) ← UBOT (private VPS, polls outbound)
```

UBOT polls the relay outbound — no inbound ports or tunnels needed.

## Relay Server (`ubot-core/webchat-relay/server.js`)

### Visitor-Facing Endpoints
| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Standalone chat PWA |
| `/widget.js` | GET | Embeddable widget script |
| `/api/config` | GET | Widget config (title, color, welcome) |
| `/api/message` | POST | Send message (holds until UBOT replies, 45s timeout) |
| `/api/history` | GET | Conversation history for a session |

### Bot-Facing Endpoints (authenticated with `BOT_SECRET`)
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/bot/poll` | GET | UBOT long-polls for pending visitor messages (25s) |
| `/api/bot/reply` | POST | UBOT sends response for a pending message |
| `/api/bot/config` | POST | UBOT pushes widget config to relay |
| `/health` | GET | Returns `{status, pending, sessions}` |

### Flow
1. Visitor POSTs message → relay creates `pendingMessages` entry → notifies any waiting poll
2. UBOT polls `/api/bot/poll` → gets message → processes with LLM → POSTs to `/api/bot/reply`
3. Relay resolves the visitor's waiting request with the response

## UBOT Connection (`src/channels/webchat/connection.ts`)

`WebchatConnection` class handles:
- **Health check** on `connect()` before starting poll loop
- **Poll loop**: Continuous long-poll to `/api/bot/poll?secret=<BOT_SECRET>`
- **In-flight deduplication**: Tracks message IDs being processed — prevents re-dispatching the same message while LLM is running (critical fix, March 2026)
- **500ms pause** between polls when no messages pending (avoids tight loop)
- **`respond(messageId, text)`**: Sends reply to relay, removes from in-flight set
- **Auto-reconnect**: Exponential backoff (2s → 30s max) on poll errors

### Key Behaviour: In-Flight Deduplication

The relay keeps a message in `pendingMessages` until UBOT replies. Without deduplication, every poll cycle re-delivers the same message while the LLM is running. Fix: `inFlightMessageIds: Set<string>` — added March 2026.

```typescript
if (this.inFlightMessageIds.has(msg.id)) continue; // skip re-delivery
this.inFlightMessageIds.add(msg.id);
// ...process with LLM...
// On response:
this.inFlightMessageIds.delete(messageId); // removed in respond()
```

## Deploy Relay

```bash
cd ubot-core
./deploy-relay.sh
```

Script uses `gcloud run deploy` to `europe-west1`. The `BOT_SECRET` is auto-read from `~/.ubot/config.json` and injected as an env var.

## Embed Widget on Any Website

```html
<script src="https://ubot-webchat-relay-q5uh5lc42q-ew.a.run.app/widget.js"
        data-server="https://ubot-webchat-relay-q5uh5lc42q-ew.a.run.app">
</script>
```

Direct chat link: `https://ubot-webchat-relay-q5uh5lc42q-ew.a.run.app`

## Config in UBOT (`~/.ubot/config.json`)

```json
{
  "channels": {
    "webchat": {
      "enabled": true,
      "relay_url": "https://ubot-webchat-relay-q5uh5lc42q-ew.a.run.app",
      "bot_secret": "<secret>",
      "auto_reply": true,
      "owner_key": "boss123",
      "widget_title": "Ask me anything",
      "widget_color": "#996515",
      "avatar_url": "https://www.bigmints.com/profile.png"
    }
  }
}
```

> `auto_reply` **must be `true`** for UBOT to call the LLM on visitor messages. With `false`, messages are received but not processed.
