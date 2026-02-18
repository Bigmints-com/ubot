# Ubot Core — Agent Instructions

> Personal AI assistant platform — manages messaging, automation, and contacts
> across WhatsApp, Telegram, and web.
> Last updated: 2026-02-18

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
| Logging            | Winston + Pino                                                           |
| Testing            | Vitest                                                                   |
| Linter             | ESLint                                                                   |
| CSS                | Tailwind CSS v4                                                          |
| Web UI             | Next.js + shadcn/ui (separate `web/` directory)                          |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Server (:4081)                       │
│  src/index.ts — serves static files + routes /api/* to api.ts   │
├─────────────────────────────────────────────────────────────────┤
│                      REST API (api.ts)                          │
│  All /api/* endpoints — config, chat, WhatsApp, Telegram,       │
│  skills, scheduler, safety, personas, approvals                 │
├─────────────┬───────────────┬───────────────────────────────────┤
│  Unified    │   Agent       │   Skill Engine                    │
│  Message    │   Orchestrator│   Event → Trigger → Processor     │
│  Handler    │   (LLM loop)  │   → Outcome                      │
├─────────────┴───────────────┴───────────────────────────────────┤
│  WhatsApp    │  Telegram     │  Web Console                     │
│  Connection  │  Connection   │  (Next.js UI on :4080)           │
├──────────────┴───────────────┴──────────────────────────────────┤
│  SQLite Database  │  Soul (Personas)  │  Memory Store           │
└───────────────────┴───────────────────┴─────────────────────────┘
```

## Project Structure

```
ubot-core/
├── .env                              # Environment config (PORT, LLM keys, DB path)
├── package.json
├── tsconfig.json                     # ES2022, NodeNext modules, strict
├── vitest.config.ts
├── tailwind.config.js
├── postcss.config.js
│
├── src/
│   ├── index.ts                      # HTTP server, app bootstrap, static file serving
│   ├── api.ts                        # All REST API routes (/api/*)
│   ├── unified-message.ts            # Unified message handler (all channels → single pipeline)
│   ├── llm-client.ts                 # LLM API client wrapper
│   ├── types.ts                      # Shared top-level types
│   ├── browser-skill.ts              # Puppeteer browser automation skill
│   ├── email-skill.ts                # Email sending via nodemailer
│   │
│   ├── agent/                        # Core AI agent system
│   │   ├── orchestrator.ts           # Main agent loop: message → LLM → tools → response
│   │   ├── tools.ts                  # Tool definitions (send_message, web_search, browse, etc.)
│   │   ├── soul.ts                   # Soul module — personas, identity, memory (YAML docs)
│   │   ├── conversation.ts           # Conversation session storage
│   │   ├── memory-store.ts           # Key-value memory store (persona documents)
│   │   ├── pending-approvals.ts      # Owner approval request queue
│   │   ├── types.ts                  # Agent types (AgentConfig, AgentResponse, ToolDefinition)
│   │   └── index.ts
│   │
│   ├── agents/                       # Agent utility types
│   │   ├── types.ts
│   │   └── utils.ts
│   │
│   ├── skills/                       # Universal Skill Engine
│   │   ├── skill-engine.ts           # Event → Trigger Match → Processor → Outcome pipeline
│   │   ├── skill-types.ts            # Skill, SkillEvent, SkillTrigger, SkillOutcome types
│   │   ├── skill-repository.ts       # SQLite CRUD for skills
│   │   ├── service.ts                # Skills service layer
│   │   ├── repository.ts             # Generic data repository
│   │   ├── event-bus.ts              # Pub/sub event system for skill triggers
│   │   ├── shell-skill.ts            # Shell command execution skill
│   │   ├── types.ts                  # Skill service types
│   │   ├── utils.ts                  # Skill utility functions
│   │   ├── index.ts
│   │   ├── memory/                   # Skill memory subsystem
│   │   │   ├── service.ts
│   │   │   ├── types.ts
│   │   │   ├── utils.ts
│   │   │   └── index.ts
│   │   ├── file-management/          # File management for skills
│   │   │   ├── service.ts
│   │   │   ├── types.ts
│   │   │   ├── utils.ts
│   │   │   └── index.ts
│   │   └── web-search/               # Web search integration
│   │       ├── service.ts
│   │       ├── types.ts
│   │       ├── utils.ts
│   │       └── index.ts
│   │
│   ├── database/                     # SQLite database layer
│   │   ├── connection.ts             # DB connection + migration runner
│   │   ├── migrations.ts             # Schema migrations
│   │   ├── repository.ts             # Generic query helpers
│   │   ├── types.ts                  # DB types
│   │   └── index.ts
│   │
│   ├── messaging/                    # Messaging provider abstraction
│   │   ├── registry.ts               # Provider registry (WhatsApp, Telegram, etc.)
│   │   ├── types.ts                  # MessagingProvider interface
│   │   └── index.ts
│   │
│   ├── whatsapp/                     # WhatsApp integration (Baileys)
│   │   ├── connection.ts             # WhatsApp connection management + QR auth
│   │   ├── adapter.ts                # Message adapter (WhatsApp ↔ unified format)
│   │   ├── messaging-provider.ts     # WhatsApp MessagingProvider implementation
│   │   ├── types.ts                  # WhatsApp-specific types
│   │   ├── utils.ts                  # JID helpers, message formatting
│   │   └── index.ts
│   │
│   ├── telegram/                     # Telegram integration
│   │   ├── connection.ts             # Telegram bot connection management
│   │   ├── messaging-provider.ts     # Telegram MessagingProvider implementation
│   │   ├── types.ts                  # Telegram-specific types
│   │   └── index.ts
│   │
│   ├── scheduler/                    # Task scheduler (cron-based)
│   │   ├── service.ts                # Scheduler service (cron jobs, one-time tasks)
│   │   ├── types.ts                  # ScheduledTask types
│   │   ├── utils.ts                  # Time parsing, cron expression helpers
│   │   └── index.ts
│   │
│   ├── safety/                       # Safety & content filtering
│   │   ├── service.ts                # Safety rules engine
│   │   ├── types.ts                  # Safety rule types
│   │   ├── utils.ts                  # Content analysis utilities
│   │   └── index.ts
│   │
│   ├── prompt-builder/               # System prompt construction
│   │   ├── builder.ts                # Builds dynamic system prompts with tool/persona injection
│   │   ├── templates.ts              # Prompt templates
│   │   ├── types.ts                  # Builder types
│   │   └── index.ts
│   │
│   ├── config/                       # Configuration management
│   │   ├── loader.ts                 # Config file loading + validation
│   │   ├── types.ts                  # Config types
│   │   └── index.ts
│   │
│   └── logger/                       # Logging
│       ├── index.ts                  # Winston + Pino logger setup
│       └── types.ts
│
├── web/                              # Next.js shadcn/ui Dashboard (port 4080)
│   ├── package.json                  # Separate npm project
│   ├── next.config.ts                # Proxies /api/* to backend on :4081
│   ├── components.json               # shadcn/ui config
│   ├── app/
│   │   ├── layout.tsx                # Root layout with sidebar
│   │   ├── page.tsx                  # Home / dashboard
│   │   ├── globals.css               # Global Tailwind styles
│   │   ├── chat/page.tsx             # Chat interface (web console)
│   │   ├── personas/page.tsx         # Persona (soul) document management
│   │   ├── skills/page.tsx           # Skills CRUD
│   │   ├── scheduler/page.tsx        # Scheduled tasks
│   │   ├── safety/page.tsx           # Safety rules
│   │   ├── settings/page.tsx         # App settings (LLM, auto-reply, etc.)
│   │   ├── whatsapp/page.tsx         # WhatsApp connection/status
│   │   ├── telegram/page.tsx         # Telegram bot connection
│   │   └── approvals/page.tsx        # Pending owner approvals
│   ├── components/
│   │   ├── app-sidebar.tsx           # Navigation sidebar
│   │   ├── page-breadcrumb.tsx       # Breadcrumb component
│   │   └── ui/                       # shadcn/ui primitives (20 components)
│   ├── hooks/
│   └── lib/
│
├── data/                             # Runtime data (gitignored)
│   └── ubot.db                       # SQLite database
│
├── public/                           # Static files served by backend
│   ├── css/
│   │   ├── input.css                 # Tailwind source
│   │   └── output.css                # Compiled CSS
│   └── ...                           # Next.js static export output
│
└── sessions/                         # WhatsApp session data (gitignored)
```

## Key Concepts

### Agent Orchestrator (`src/agent/orchestrator.ts`)

The core AI loop: receives a message → builds a system prompt (with soul context) → calls the LLM with tool definitions → executes tool calls → returns response. Supports multi-turn tool calling (up to `maxToolIterations`).

### Unified Message Handler (`src/unified-message.ts`)

All channels (WhatsApp, Telegram, web) normalize their messages into a `UnifiedMessage` and pass through `handleIncomingMessage()`. This is the single source of truth for owner detection, session routing, approval handling, and skill event emission.

### Soul Module (`src/agent/soul.ts`)

Ubot's identity and memory system with three layers:

1. **Bot Soul** (`__bot__`) — personality, tone, boundaries
2. **Owner Soul** (`__owner__`) — owner profile, preferences, context
3. **Contact Souls** — auto-updated profiles for each contact

Documents are stored as YAML and injected into the system prompt.

### Skill Engine (`src/skills/skill-engine.ts`)

User-created automations following: **Event → Trigger → Processor → Outcome**

- **Two-phase matching**: Phase 1 = fast filters (contacts, groups, pattern), Phase 2 = LLM intent check
- **Outcomes**: reply (to sender), send (to target), store (save), silent (tools handled it)
- Skills are stored in SQLite, not in code

### Agent Tools (`src/agent/tools.ts`)

Platform-agnostic tool definitions: `send_message`, `get_messages`, `get_contacts`, `delete_message`, `reply_to_message`, `schedule_message`, `set_auto_reply`, `web_search`, `ask_owner`, `list_pending_approvals`, `list_skills`, `create_skill`, `update_skill`, `delete_skill`, `browse_url`, `browser_click`, `browser_type`, `browser_read_page`, `browser_screenshot`.

Visitor (non-owner) sessions are restricted to `ask_owner` only.

### Owner Approval System (`src/agent/pending-approvals.ts`)

When a third-party asks something sensitive, the bot escalates via `ask_owner` tool. The owner sees pending approvals in the dashboard and can respond.

## API Endpoints

All routes are handled in `src/api.ts`:

| Method         | Path                         | Description                        |
| -------------- | ---------------------------- | ---------------------------------- |
| GET            | `/health`                    | Health check                       |
| GET            | `/api/state`                 | App state + uptime                 |
| POST           | `/api/chat`                  | Chat with the agent (web console)  |
| GET/PUT        | `/api/config`                | App config (LLM, auto-reply, etc.) |
| GET/POST       | `/api/skills`                | List / create skills               |
| GET/PUT/DELETE | `/api/skills/:id`            | Get / update / delete a skill      |
| GET/POST       | `/api/scheduler/tasks`       | List / create scheduled tasks      |
| DELETE         | `/api/scheduler/tasks/:id`   | Delete a scheduled task            |
| GET/POST       | `/api/safety/rules`          | Safety rules CRUD                  |
| GET/POST       | `/api/personas`              | List / create persona documents    |
| GET/PUT/DELETE | `/api/personas/:id`          | Persona document CRUD              |
| POST           | `/api/whatsapp/connect`      | Start WhatsApp connection          |
| POST           | `/api/whatsapp/disconnect`   | Disconnect WhatsApp                |
| GET            | `/api/whatsapp/status`       | WhatsApp connection status         |
| GET            | `/api/whatsapp/qr`           | Get WhatsApp QR code               |
| GET            | `/api/whatsapp/messages`     | Recent WhatsApp messages           |
| GET            | `/api/whatsapp/contacts`     | WhatsApp contacts                  |
| POST           | `/api/telegram/connect`      | Start Telegram bot                 |
| POST           | `/api/telegram/disconnect`   | Disconnect Telegram                |
| GET            | `/api/telegram/status`       | Telegram connection status         |
| GET            | `/api/telegram/messages`     | Recent Telegram messages           |
| GET            | `/api/approvals`             | List pending approvals             |
| POST           | `/api/approvals/:id/respond` | Respond to an approval             |
| GET            | `/api/conversations`         | List conversation sessions         |
| GET            | `/api/conversations/:id`     | Get conversation messages          |

## Conventions

- Run `npm install` in both `ubot-core/` and `ubot-core/web/`
- Start with `../start.sh` (launches backend on :4081 + Next.js UI on :4080)
- Stop with `../stop.sh`
- Test with `npx vitest run`
- Lint with `npx eslint .`
- TypeScript strict mode — no `any` where avoidable
- Factory pattern for modules: `createXxx()` returns an interface (no classes)
- All messaging goes through `unified-message.ts` — never handle messages directly in adapters
- Skills are stored in DB, not in code — use CRUD APIs
- Environment config in `.env` — never hardcode keys
- Database migrations in `src/database/migrations.ts` and inline in modules

## Environment Variables

| Variable         | Description                       | Default            |
| ---------------- | --------------------------------- | ------------------ |
| `PORT`           | Backend HTTP port                 | `4080`             |
| `LLM_BASE_URL`   | OpenAI-compatible API endpoint    | Gemini API         |
| `LLM_MODEL`      | Model name                        | `gemini-2.0-flash` |
| `LLM_API_KEY`    | API key for LLM provider          | —                  |
| `GOOGLE_API_KEY` | Google API key (fallback for LLM) | —                  |
| `DATABASE_PATH`  | SQLite database file path         | `./data/ubot.db`   |
| `NODE_ENV`       | Environment mode                  | `development`      |

## Test Files

| Test                | Path                                    |
| ------------------- | --------------------------------------- |
| App server          | `src/index.test.ts`                     |
| Skills service      | `src/skills/service.test.ts`            |
| Skills utils        | `src/skills/utils.test.ts`              |
| Skills repository   | `src/skills/repository.test.ts`         |
| Skills memory       | `src/skills/memory/service.test.ts`     |
| Web search          | `src/skills/web-search/service.test.ts` |
| Database connection | `src/database/connection.test.ts`       |
| Database repository | `src/database/repository.test.ts`       |
| WhatsApp adapter    | `src/whatsapp/adapter.test.ts`          |
| WhatsApp utils      | `src/whatsapp/utils.test.ts`            |
| Scheduler service   | `src/scheduler/service.test.ts`         |
| Safety service      | `src/safety/service.test.ts`            |
| Safety utils        | `src/safety/utils.test.ts`              |
| Prompt builder      | `src/prompt-builder/builder.test.ts`    |
| Config loader       | `src/config/loader.test.ts`             |
| Logger              | `src/logger/logger.test.ts`             |
