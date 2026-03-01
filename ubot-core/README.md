# Ubot Core

> The backend engine and API for Ubot — a self-hosted AI assistant.

This is the main application package containing the AI orchestrator, tool registry, messaging channels, integrations, and REST API.

## Stack

| Layer      | Technology                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Runtime    | Node.js (ES2022)                                                                                 |
| Language   | TypeScript (strict)                                                                              |
| LLM Client | OpenAI SDK (compatible with Gemini, Ollama, OpenAI, Anthropic)                                   |
| Database   | SQLite via `better-sqlite3`                                                                      |
| Messaging  | WhatsApp (`@whiskeysockets/baileys`), Telegram (`node-telegram-bot-api`), iMessage (BlueBubbles) |
| Browser    | Puppeteer                                                                                        |
| Scheduler  | `node-cron`                                                                                      |
| Email      | `nodemailer`                                                                                     |
| Testing    | Vitest                                                                                           |
| Web UI     | Next.js + shadcn/ui (in `web/`)                                                                  |

## Architecture

```
src/
├── index.ts              # HTTP server + app bootstrap
├── api/                  # REST API layer
│   ├── index.ts          # State management, channel routes
│   ├── context.ts        # Shared ApiContext + utilities
│   └── routes/           # Route handlers
├── engine/               # Core AI engine
│   ├── orchestrator.ts   # Main agent loop: message → LLM → tools → response
│   ├── handler.ts        # Unified message handler (all channels)
│   ├── llm.ts            # LLM API client wrapper
│   └── prompt-builder/   # Dynamic system prompt construction
├── tools/                # Modular tool registry (LLM-callable functions)
│   ├── registry.ts       # Central loader (10 modules, 77 tools)
│   ├── messaging.ts      # 8 tools: send, search, contacts, etc.
│   ├── google.ts         # 29 tools: Gmail, Drive, Sheets, Docs, etc.
│   ├── browser.ts        # 8 tools: browse, click, type, screenshot
│   ├── cli.ts            # 10 tools: cli_run, cli_status, cli_stop, etc.
│   ├── files.ts          # 5 tools: read, write, list, delete, search
│   ├── scheduler.ts      # 6 tools: schedule, remind, auto-reply
│   ├── skills.ts         # 4 tools: CRUD automations
│   ├── memory.ts         # 3 tools: store, recall, manage
│   ├── web-search.ts     # 1 tool: web search
│   └── approvals.ts      # 3 tools: owner approval flow
├── channels/             # Messaging channels
│   ├── whatsapp/         # WhatsApp (Baileys)
│   ├── telegram/         # Telegram (node-telegram-bot-api)
│   └── imessage/         # iMessage (BlueBubbles REST API)
├── integrations/         # External service integrations
│   ├── google/           # Google Workspace (OAuth2)
│   └── mcp/              # Model Context Protocol servers
├── capabilities/         # Built-in capabilities
│   ├── browser/          # Puppeteer browser automation
│   ├── cli/              # CLI agent integration (Gemini/Claude/Codex)
│   ├── scheduler/        # Cron-based task scheduler
│   └── skills/           # Skill engine (Event → Trigger → Processor → Outcome)
├── memory/               # Personas, conversation history, memory store
├── data/                 # SQLite database + config management
├── safety/               # Safety rules & guardrails
└── logger/               # Structured logging (Winston + Pino)
```

## Message Flow

```
Incoming Message (WhatsApp / Telegram / iMessage / Web)
    ↓
Unified Handler → detect owner vs visitor
    ↓
┌─────────────────┐    ┌──────────────────┐
│  Owner           │    │  Visitor          │
│  All 77 tools    │    │  ask_owner tool   │
│  Full access     │    │  Safety rules     │
└────────┬────────┘    └────────┬─────────┘
         ↓                      ↓
    Orchestrator (LLM loop)
         ↓
    Tool calls → Response
         ↓
    Soul extraction (update contact profiles)
```

## Development

```bash
# TypeScript check
npx tsc --noEmit

# Run tests
npx vitest run

# Watch mode
npx vitest

# Build backend
npm run build

# Build dashboard
cd web && npm run build
```

## Key Concepts

- **Orchestrator** — Multi-turn agent loop: message → LLM → tools → response
- **Soul System** — Evolving personality profiles (bot soul, owner soul, contact souls)
- **Skill Engine** — User-created automations: Event → Trigger → Processor → Outcome
- **Tool Registry** — Modular tool system, each module exports a `ToolModule`
- **Safety Rules** — Configurable guardrails for content and actions
- **MCP Support** — Extend with any Model Context Protocol server

## License

MIT
