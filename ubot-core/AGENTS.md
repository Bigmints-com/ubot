# Ubot Core — Agent Instructions

> Personal AI assistant platform — manages messaging, automation, and contacts
> across WhatsApp, Telegram, and web.
> Last updated: 2026-02-20

## Stack

| Layer              | Technology                                                               |
| ------------------ | ------------------------------------------------------------------------ |
| Runtime            | Node.js (ES2022)                                                         |
| Language           | TypeScript (strict)                                                      |
| Package Manager    | npm                                                                      |
| LLM Client         | OpenAI SDK (compatible with Gemini, Ollama, OpenAI)                      |
| Database           | SQLite via `better-sqlite3`                                              |
| Messaging          | WhatsApp (`@whiskeysockets/baileys`), Telegram (`node-telegram-bot-api`) |
| Browser Automation | Puppeteer                                                                |
| Scheduler          | `node-cron`                                                              |
| Email              | `nodemailer`                                                             |
| Logging            | Winston + Pino + Ring Buffer                                             |
| Testing            | Vitest                                                                   |
| Linter             | ESLint                                                                   |
| CSS                | Tailwind CSS v4                                                          |
| Web UI             | Next.js + shadcn/ui (separate `web/` directory)                          |
| CLI                | Bash (`cli/ubot`)                                                        |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     HTTP Server (:11490)                         │
│  src/index.ts — serves static files + routes /api/* to api      │
├─────────────────────────────────────────────────────────────────┤
│                    REST API (api/index.ts)                       │
│  All /api/* endpoints — config, chat, WhatsApp, Telegram,       │
│  skills, scheduler, safety, personas, approvals, Google         │
├─────────────┬───────────────┬───────────────────────────────────┤
│  Unified    │   Agent       │   Skill Engine                    │
│  Message    │   Orchestrator│   Event → Trigger → Processor     │
│  Handler    │   (LLM loop)  │   → Outcome                      │
├─────────────┴───────────────┴───────────────────────────────────┤
│  Tool Registry (tools/)                                          │
│  59 tools across 7 modules: messaging, approvals,               │
│  web-search, skills, browser, scheduler, google                  │
├──────────────┬───────────────┬──────────────────────────────────┤
│  WhatsApp    │  Telegram     │  Google Workspace                │
│  Connection  │  Connection   │  Gmail, Sheets, Drive, Calendar  │
├──────────────┴───────────────┴──────────────────────────────────┤
│  SQLite Database  │  Soul (Personas)  │  Memory Store           │
└───────────────────┴───────────────────┴─────────────────────────┘
```

## Project Structure

```
ubot/                                  # Monorepo root
├── Makefile                           # Build + install pipeline
├── start.sh                           # Dev mode launcher (backend :4081 + web :4080)
├── stop.sh                            # Dev mode stopper
├── cli/                               # CLI packaging
│   ├── ubot                           # CLI entry point (start/stop/status/logs/version)
│   └── default-config.json            # Default config template
│
├── ubot-core/                         # Main application
│   ├── package.json
│   ├── tsconfig.json                  # ES2022, NodeNext modules, strict
│   ├── vitest.config.ts
│   │
│   ├── src/
│   │   ├── index.ts                   # HTTP server, app bootstrap, static file serving
│   │   ├── types.ts                   # Shared top-level types
│   │   │
│   │   ├── api/                       # REST API layer
│   │   │   └── index.ts               # All /api/* endpoint routing
│   │   │
│   │   ├── engine/                    # Core AI engine
│   │   │   ├── orchestrator.ts        # Main agent loop: message → LLM → tools → response
│   │   │   ├── handler.ts             # Unified message handler (all channels → single pipeline)
│   │   │   ├── llm.ts                 # LLM API client wrapper
│   │   │   ├── soul.ts                # Soul module — personas, identity, memory
│   │   │   ├── conversation.ts        # Conversation session storage
│   │   │   ├── memory-store.ts        # Key-value memory store
│   │   │   ├── pending-approvals.ts   # Owner approval request queue
│   │   │   ├── tools.ts               # Legacy tool definitions
│   │   │   ├── types.ts               # Engine types (AgentConfig, ToolDefinition, etc.)
│   │   │   ├── prompt-builder/        # System prompt construction
│   │   │   │   ├── builder.ts         # Dynamic system prompts with variable interpolation
│   │   │   │   ├── templates.ts       # Prompt templates
│   │   │   │   └── types.ts
│   │   │   └── agents/                # Agent utility types
│   │   │       └── types.ts
│   │   │
│   │   ├── tools/                     # Modular tool registry (59 tools, 7 modules)
│   │   │   ├── registry.ts            # Central tool registry + module loader
│   │   │   ├── types.ts               # ToolModule, ToolRegistry interfaces
│   │   │   ├── messaging.ts           # 8 tools: send, search, contacts, conversations, etc.
│   │   │   ├── approvals.ts           # 3 tools: ask_owner, respond, list_pending
│   │   │   ├── web-search.ts          # 1 tool: web_search (SearXNG + Puppeteer fallback)
│   │   │   ├── skills.ts              # 4 tools: CRUD skills
│   │   │   ├── browser.ts             # 8 tools: browse, click, type, read, screenshot, etc.
│   │   │   ├── scheduler.ts           # 6 tools: schedule, remind, list, delete, trigger, set_auto_reply
│   │   │   └── google.ts              # 29 tools: Gmail, Drive, Sheets, Docs, Contacts, Calendar, Places
│   │   │
│   │   ├── channels/                  # Messaging channels
│   │   │   ├── registry.ts            # Provider registry (WhatsApp, Telegram)
│   │   │   ├── types.ts               # MessagingProvider interface
│   │   │   ├── whatsapp/              # WhatsApp (Baileys)
│   │   │   │   ├── connection.ts      # QR auth + session management
│   │   │   │   ├── adapter.ts         # Message format adapter
│   │   │   │   ├── messaging-provider.ts
│   │   │   │   ├── rate-limiter.ts    # Anti-ban rate limiting
│   │   │   │   ├── types.ts
│   │   │   │   └── utils.ts
│   │   │   ├── telegram/              # Telegram (node-telegram-bot-api)
│   │   │   │   ├── connection.ts
│   │   │   │   ├── messaging-provider.ts
│   │   │   │   └── types.ts
│   │   │   └── google/                # Google Workspace APIs (OAuth2)
│   │   │       ├── auth.ts            # OAuth2 flow + token management
│   │   │       ├── gmail.ts
│   │   │       ├── calendar.ts
│   │   │       ├── drive.ts
│   │   │       ├── sheets.ts
│   │   │       ├── docs.ts
│   │   │       ├── contacts.ts
│   │   │       └── places.ts
│   │   │
│   │   ├── capabilities/              # Skills & automation
│   │   │   ├── browser/               # Puppeteer browser automation
│   │   │   │   └── skill.ts           # BrowserSkill class with self-healing
│   │   │   ├── scheduler/             # Task scheduler (cron-based)
│   │   │   │   ├── service.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── utils.ts
│   │   │   └── skills/                # Universal Skill Engine
│   │   │       ├── skill-engine.ts    # Event → Trigger → Processor → Outcome
│   │   │       ├── skill-types.ts
│   │   │       ├── skill-repository.ts
│   │   │       ├── service.ts
│   │   │       ├── event-bus.ts       # Pub/sub for skill triggers
│   │   │       ├── browsing-playbooks.ts
│   │   │       ├── memory/            # Skill memory subsystem
│   │   │       ├── file-management/   # File operations skill
│   │   │       └── web-search/        # Web search skill
│   │   │
│   │   ├── data/                      # Data & persistence
│   │   │   ├── database/              # SQLite layer
│   │   │   │   ├── connection.ts      # DB connection + migration runner
│   │   │   │   ├── migrations.ts      # Schema migrations
│   │   │   │   ├── repository.ts
│   │   │   │   └── types.ts
│   │   │   ├── config/                # Configuration management
│   │   │   │   ├── loader.ts
│   │   │   │   └── types.ts
│   │   │   └── safety/                # Safety & content filtering
│   │   │       ├── service.ts
│   │   │       ├── types.ts
│   │   │       └── utils.ts
│   │   │
│   │   ├── logger/                    # Logging
│   │   │   ├── index.ts
│   │   │   ├── ring-buffer.ts         # In-memory log ring buffer
│   │   │   └── types.ts
│   │   │
│   │   └── metrics/                   # Runtime metrics
│   │       └── index.ts
│   │
│   ├── web/                           # Next.js shadcn/ui Dashboard
│   │   ├── app/
│   │   │   ├── page.tsx               # Home / dashboard
│   │   │   ├── chat/page.tsx          # Chat console
│   │   │   ├── personas/page.tsx      # Persona management
│   │   │   ├── skills/page.tsx        # Skills CRUD
│   │   │   ├── scheduler/page.tsx     # Scheduled tasks
│   │   │   ├── safety/page.tsx        # Safety rules
│   │   │   ├── settings/page.tsx      # App settings
│   │   │   ├── whatsapp/page.tsx      # WhatsApp connection
│   │   │   ├── telegram/page.tsx      # Telegram bot
│   │   │   ├── google/page.tsx        # Google Apps
│   │   │   ├── approvals/page.tsx     # Owner approvals
│   │   │   └── logs/page.tsx          # Log viewer
│   │   └── components/
│   │       ├── app-sidebar.tsx
│   │       └── ui/                    # shadcn/ui primitives
│   │
│   └── public/                        # Static assets
│
└── ~/.ubot/                           # Runtime directory (created by CLI)
    ├── config.json                    # Unified config (LLM, port, etc.)
    ├── lib/                           # Compiled backend (from dist/)
    ├── web/                           # Static web export
    ├── data/ubot.db                   # SQLite database
    ├── logs/ubot.log                  # Application logs
    ├── sessions/                      # WhatsApp session data
    ├── creds/                         # Google OAuth tokens
    └── browser-profile/               # Puppeteer user data
```

## Key Concepts

### Agent Orchestrator (`src/engine/orchestrator.ts`)

The core AI loop: receives a message → builds a system prompt (with soul context) → calls the LLM with tool definitions → executes tool calls → returns response. Supports multi-turn tool calling (up to `maxToolIterations`).

### Unified Message Handler (`src/engine/handler.ts`)

All channels (WhatsApp, Telegram, web) normalize their messages into a `UnifiedMessage` and pass through `handleIncomingMessage()`. This is the single source of truth for owner detection, session routing, approval handling, and skill event emission.

### Tool Registry (`src/tools/registry.ts`)

Modular tool system. Each module (e.g., `messaging.ts`, `google.ts`) exports a `ToolModule` with tool definitions and executor registrations. The registry loads all 7 modules at boot, providing 59 tools to the LLM.

### Soul Module (`src/engine/soul.ts`)

Ubot's identity and memory system. Three document types:

1. **Bot Soul** (`__bot__`) — personality, tone, boundaries
2. **Owner Soul** (`__owner__`) — owner profile, preferences, context
3. **Contact Souls** — auto-updated profiles for each contact

Each contact has a **three-layer data architecture**:

- **Persona layer** — qualitative YAML document (personality, preferences, relationship context)
- **Chat history layer** — structured conversation logs stored in SQLite
- **Personal details layer** — key-value facts (birthday, phone, etc.) for quick retrieval

### Skill Engine (`src/capabilities/skills/skill-engine.ts`)

User-created automations following: **Event → Trigger → Processor → Outcome**

- **Two-phase matching**: Phase 1 = fast filters (contacts, groups, pattern), Phase 2 = LLM intent check
- **Outcomes**: reply (to sender), send (to target), store (save), silent (tools handled it)
- Skills are stored in SQLite, not in code

### Tool Modules (`src/tools/`)

| Module       | Tools | Description                                            |
| ------------ | ----- | ------------------------------------------------------ |
| `messaging`  | 8     | send, search, contacts, conversations, delete, reply   |
| `approvals`  | 3     | ask_owner, respond, list_pending                       |
| `web-search` | 1     | web_search (SearXNG + Puppeteer fallback)              |
| `skills`     | 4     | CRUD skills                                            |
| `browser`    | 8     | browse, click, type, read, screenshot, scroll, emails  |
| `scheduler`  | 6     | schedule, remind, list, delete, trigger, auto_reply    |
| `google`     | 29    | Gmail, Drive, Sheets, Docs, Contacts, Calendar, Places |

### Owner Approval System (`src/engine/pending-approvals.ts`)

When a third-party asks something sensitive, the bot escalates via `ask_owner` tool. The owner sees pending approvals in the dashboard and can respond.

## CLI & Installation

```bash
# From source
git clone https://github.com/Bigmints-com/ubot.git
cd ubot && make deps
make install         # Builds + installs to ~/.ubot + CLI to ~/.local/bin

# Manage
ubot start           # Start on port 11490
ubot stop            # Graceful shutdown
ubot status          # Show PID, port, dashboard URL
ubot logs            # Last 50 log lines
ubot logs -f         # Follow logs
ubot version         # Version info
```

Config: `~/.ubot/config.json` — LLM provider, port, API keys.

## Conventions

- **Build & Install**: `make install` (builds backend + web UI, installs to `~/.ubot`)
- **Development**: `./start.sh` (backend on :4081 + Next.js UI on :4080 with hot reload)
- **Production**: `ubot start` (runs from `~/.ubot/lib/` on port 11490)
- **Test**: `npx vitest run`
- **Lint**: `npx eslint .`
- TypeScript strict mode — no `any` where avoidable
- Factory pattern for modules: `createXxx()` returns an interface (no classes)
- All messaging goes through `engine/handler.ts` — never handle messages directly in adapters
- Skills are stored in DB, not in code — use CRUD APIs
- Config in `~/.ubot/config.json` (production) or `.env` (development)
- Database migrations in `data/database/migrations.ts` and inline in modules
- Copy compiled code with `rm -rf lib && cp -R dist lib` (macOS `cp -r` doesn't reliably overwrite)

## Environment Variables

| Variable         | Description                       | Default            |
| ---------------- | --------------------------------- | ------------------ |
| `PORT`           | Backend HTTP port                 | `11490`            |
| `LLM_BASE_URL`   | OpenAI-compatible API endpoint    | Gemini API         |
| `LLM_MODEL`      | Model name                        | `gemini-2.0-flash` |
| `LLM_API_KEY`    | API key for LLM provider          | —                  |
| `GOOGLE_API_KEY` | Google API key (fallback for LLM) | —                  |
| `DATABASE_PATH`  | SQLite database file path         | `./data/ubot.db`   |
| `NODE_ENV`       | Environment mode                  | `development`      |
| `UBOT_HOME`      | Runtime directory override        | `~/.ubot`          |
