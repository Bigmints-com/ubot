# Anatomy Part 5: Connectivity (Channels & Messaging)

The "Interface" of Ubot. The Connectivity layer manages the bridge between Ubot and external messaging platforms.

## Core Components

- **Messaging Adapters**: Pluggable modules for four channels, each with their own connection file:
  - WhatsApp → `channels/whatsapp/connection.ts` (Baileys, raw socket protocol)
  - Telegram → `channels/telegram/connection.ts` (node-telegram-bot-api)
  - iMessage → `channels/imessage/index.ts` (BlueBubbles REST API)
  - **Webchat** → `channels/webchat/connection.ts` (Cloud Run relay via long-poll)
- **Provider Registry**: A central registry that maps channel names to their respective provider instances.
- **Standardized Event Flow**: Incoming raw messages are normalized into `UnifiedMessage` objects via a single handler (`engine/handler.ts`).

## Unified Message Handler (`handler.ts`)

All channels normalize messages into `UnifiedMessage` and call `handleIncomingMessage()`. This single function handles:

1. **Owner Detection**: Single source of truth — checks phone/Telegram ID/username against config.
2. **Auto-Save Owner IDs**: Learns and persists owner identifiers on first contact.
3. **Session Routing**: Owner → `web-console`, visitors → channel-specific sessions (e.g., WhatsApp JID, `telegram:chatId`).
4. **Skill Event Emission**: Every message emits a `SkillEvent` to the EventBus for skill matching.
5. **Auto-Reply Policy**: Master switch per channel — if OFF, nothing fires for visitors.
6. **Approval Handling** (owner only): If the owner's message explicitly references a pending approval — starts with "approve:" or contains an approval ID — the handler resolves the approval in the store, then relays the response to the requester's session via `deps.orchestrator.chat()` + `deps.relayMessage()`. Non-approval owner messages fall through to the orchestrator unchanged.
7. **Orchestrator Routing** (owner only): After approval checks, owner messages route through `deps.orchestrator.chat()` and the response is sent back via `msg.replyFn`.

## WhatsApp Interactive Messages

The WhatsApp connection (`connection.ts`) fully parses interactive bot content:

- **`extractBody(msg)`**: Handles text, interactive (buttons, lists, carousels), template, native flow, and extendedText messages. Formats interactive content as readable text with option labels.
- **`extractInteractiveOptions(msg)`**: Extracts structured `WhatsAppInteractiveOption[]` from raw messages for tool use.
- **`sendInteractiveResponse(jid, msgId, selection)`**: Sends structured responses (text_reply, button, list_item, quick_reply, native_flow) back to bots.
- **`WhatsAppInteractiveOption` type**: `{ type, id, label, description?, section?, url?, flowName?, flowParams?, cardIndex? }`

## LID Resolution

WhatsApp uses two JID formats: phone-based (`971569737344@s.whatsapp.net`) and LID-based (`127058135019537@lid`). The connection layer:

- Maintains a LID→phone mapping file in the session directory
- Resolves LIDs to phone JIDs for routing and owner detection
- Uses the original LID for replying (required by Baileys)

## Rate Limiting

All outbound WhatsApp messages go through `WhatsAppRateLimiter`:

- Per-minute: 8 messages max
- Per-hour: 60 messages max
- Per-day: 500 messages max
- Random human-like delays (1-8 seconds) between sends

## Multi-Channel Support

A single Ubot instance can listen on WhatsApp, Telegram, iMessage, and Webchat simultaneously, routing events to the same orchestrator while maintaining separate conversation stores per platform.

## Webchat Relay Channel

The webchat relay uses a **poll-outbound** architecture (UBOT polls a public Cloud Run relay — no inbound ports needed). See [webchat_relay.md](webchat_relay.md) for full details.

Key config:
```json
{ "channels": { "webchat": { "enabled": true, "relay_url": "https://...", "auto_reply": true } } }
```

> **`auto_reply` must be `true`** or visitor messages will be received but never processed by the LLM.
