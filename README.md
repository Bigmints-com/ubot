# Ubot Core

Personal AI assistant that manages your messaging channels. Acts as your private secretary — answers visitors from your profile, escalates what it can't handle, and automates tasks on your behalf.

## Features

- **Multi-Channel** — WhatsApp + Telegram, unified message handling
- **Owner & Visitor Model** — Owner gets full access; visitors get smart, policy-gated responses
- **Soul System** — Evolving personality profiles for you and every contact
- **Skill Engine** — Event-driven automation (spam deletion, scheduled tasks, browsing)
- **Browser Automation** — Puppeteer-based browsing with self-healing recovery
- **Google Integration** — Gmail, Calendar, Contacts, Drive, Docs, Sheets
- **Live Dashboard** — Next.js UI with real-time log viewer

## Quick Start

### Prerequisites

- Node.js 20+
- An LLM API key (OpenRouter, OpenAI, Anthropic, or Gemini)

### Install

```bash
git clone https://github.com/Bigmints-com/ubot.git
cd ubot/ubot-core
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your LLM API key
```

### Run

```bash
# Start backend + dashboard
./start.sh

# Dashboard: http://localhost:4080
# API: http://localhost:4081
```

### Connect Channels

1. Open the dashboard at `http://localhost:4080`
2. Go to **Settings** → add your LLM API key
3. Go to **Telegram** → connect your bot token
4. Go to **WhatsApp** → scan the QR code

## Architecture

```
src/
├── index.ts              # Entry point
├── agent/                # 🧠 Orchestrator, soul, memory, conversation
├── api/                  # 🌐 HTTP API routes
├── browser/              # 🌍 Browser automation (Puppeteer)
├── config/               # ⚙️ App configuration
├── database/             # 💾 SQLite database layer
├── google/               # 📧 Google workspace integration
├── llm/                  # 🤖 LLM client
├── logger/               # 📊 Structured logging
├── messaging/            # 💬 Unified message handler + registry
├── metrics/              # 📈 Usage metrics
├── safety/               # 🛡️ Content safety rules
├── scheduler/            # ⏰ Cron-style task scheduler
├── skills/               # 🔧 Event-driven skill engine
├── telegram/             # 📱 Telegram adapter
├── tools/                # 🛠️ Tool registry + definitions
└── whatsapp/             # 📲 WhatsApp adapter (Baileys)
```

### Message Flow

```
Incoming Message
    ↓
Unified Handler (detect owner/visitor)
    ↓
┌─────────────────┐    ┌──────────────────┐
│  Owner           │    │  Visitor          │
│  All 59 tools    │    │  ask_owner tool   │
│  Full access     │    │  Security policy  │
│                  │    │  Owner profile    │
└────────┬────────┘    └────────┬─────────┘
         ↓                      ↓
    Orchestrator (same path for both)
         ↓
    LLM → Tool calls → Response
         ↓
    Soul extraction (update contact profiles)
```

## Development

```bash
# TypeScript check
npx tsc --noEmit

# Run tests
npx vitest

# Build dashboard
cd web && npx next build
```

## License

Private — © Bigmints
