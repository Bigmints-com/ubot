<p align="center">
  <img src="ubot-core/web/public/ubot.svg" width="80" alt="Ubot Logo" />
</p>

<h1 align="center">Ubot</h1>
<p align="center"><strong>Your Personal AI Operating System</strong></p>
<p align="center">
  Open-source, self-hosted AI assistant that connects to your messaging apps, tools, and services.<br/>
  Runs locally. Privacy-first. Extensible via MCP.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%E2%89%A522-green" alt="Node.js ≥22" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" /></a>
</p>

---

## What is Ubot?

Ubot is a **self-hosted AI assistant** that acts as your personal operating system for digital life. Connect it to WhatsApp, Telegram, iMessage, Gmail, and more — then control everything through natural conversation. It browses the web, sends messages, manages files, schedules tasks, and replies to people on your behalf.

Unlike cloud-based assistants, Ubot runs **entirely on your machine**. Your data never leaves your computer.

### Key Capabilities

- 🗣️ **LLM-First Architecture** — Every message goes through the LLM orchestrator. It analyzes intent, calls tools, follows skill instructions, or responds conversationally.
- 📱 **Multi-Channel** — WhatsApp, Telegram, iMessage — all normalized into a unified message flow.
- 🧠 **Soul System** — Evolving personality profiles for you and every contact. The bot learns and remembers.
- ⚡ **80+ Native Tools** — Messaging, Google Workspace, file management, web search, scheduling, CLI agents, and more.
- 🔌 **MCP Extensible** — Connect any [Model Context Protocol](https://modelcontextprotocol.io/) server to add new capabilities.
- 🤖 **Multi-LLM** — Works with OpenAI, Anthropic, Google Gemini, Ollama (local), or any OpenAI-compatible API.
- 🛡️ **Safety & Security** — Configurable guardrails, visitor-safe tool restrictions, approval workflows for sensitive actions.
- 📊 **Dashboard** — Beautiful Next.js + shadcn/ui control center with real-time processing indicators.

---

## Tool Modules

| Module               | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| **Messaging**        | Send, search, forward messages across WhatsApp, Telegram, iMessage |
| **Google Workspace** | Gmail, Drive, Sheets, Docs, Contacts, Calendar, Places             |
| **CLI Agents**       | Delegate coding tasks to Gemini CLI, Claude Code, or Codex         |
| **File System**      | Read, write, list, search files & folders (sandboxed)              |
| **Scheduler**        | Cron jobs, reminders, one-time tasks with persistent storage       |
| **Skills**           | Custom automations with triggers, conditions & outcomes            |
| **Memory**           | Store & recall memories, manage contact personas                   |
| **Web Search**       | Serper API + direct fetch fallback                                 |
| **Approvals**        | Owner approval flow for sensitive visitor actions                  |
| **Follow-ups**       | Schedule conversation follow-ups and closure checks                |
| **Vault**            | Secure credential storage for API keys and secrets                 |
| **Apple**            | Calendar, Reminders, Notes integration (macOS)                     |

---

## Quick Start

```bash
# Clone
git clone https://github.com/Bigmints-com/ubot.git
cd ubot

# Install dependencies + build + install
make install

# Start
ubot start
```

Dashboard: **http://localhost:11490**

### Connect Your Channels

1. Open the dashboard
2. Go to **LLMs** → add your LLM provider (Gemini, OpenAI, Ollama, etc.)
3. Go to **WhatsApp** → scan the QR code
4. Go to **Telegram** → enter your bot token
5. Go to **iMessage** → enter your BlueBubbles server URL and password
6. Go to **Google** → connect your Google account

---

## Architecture

```
ubot/
├── Makefile                  # Build + install pipeline
├── start.sh / stop.sh        # Dev mode scripts
└── ubot-core/                # Main application
    ├── src/
    │   ├── api/              # REST API (custom HTTP router)
    │   ├── engine/           # LLM orchestrator, tool routing, unified handler
    │   ├── channels/         # WhatsApp (Baileys), Telegram, iMessage adapters
    │   ├── capabilities/     # Google, Apple, CLI, web-search, filesystem
    │   ├── agents/           # Skills engine, vault, specialized agents
    │   ├── automation/       # Scheduler, approvals, follow-ups
    │   ├── memory/           # Soul system, conversation store, personas
    │   ├── data/             # SQLite database & config management
    │   └── logger/           # Ring-buffer structured logging
    └── web/                  # Next.js 16 + shadcn/ui dashboard
```

### Message Flow (LLM-First)

```
Message → Input Filters → Owner Detection → Orchestrator (LLM)
                                              ├─ Tools & MCP
                                              ├─ Skill context
                                              ├─ Conversational reply
                                              └─ Ask for details
```

All valid messages — from both the owner and visitors — go through the LLM orchestrator. Skills are injected as context, not a separate gating pipeline. See [`.agents/specs/message-flow.md`](.agents/specs/message-flow.md) for the full architectural contract.

### Data Storage

| What     | Where                                 |
| -------- | ------------------------------------- |
| Config   | `~/.ubot/config.json`                 |
| Database | `~/.ubot/data/ubot.db` (SQLite)       |
| Skills   | `~/.ubot/skills/<name>/SKILL.md`      |
| Identity | `~/.ubot/data/SOUL.md`, `IDENTITY.md` |
| Backend  | `~/.ubot/lib/` (compiled JS)          |
| Web UI   | `~/.ubot/web/` (Next.js static)       |
| Logs     | `~/.ubot/logs/`                       |

---

## CLI

```bash
ubot start             # Start on port 11490
ubot stop              # Graceful shutdown
ubot restart           # Stop + start
ubot status            # Show PID, port, dashboard URL
ubot logs              # Last 50 log lines
ubot logs -f           # Follow logs in real-time
ubot config            # Show current config
ubot config edit       # Open config in $EDITOR
ubot config set k v    # Set a config value
ubot config get k      # Get a config value
ubot doctor            # Health check
ubot open              # Open dashboard in browser
```

---

## Development

```bash
# Dev mode (hot reload for both backend + frontend)
./start.sh             # Backend on :4081 + Next.js on :4080

# Stop dev servers
./stop.sh

# Run tests
cd ubot-core && npx vitest

# Build + deploy to runtime
make install           # Builds, copies to ~/.ubot/, restarts
```

> **Important**: `npm run build` only compiles to `ubot-core/dist/`. The runtime loads from `~/.ubot/lib/`. Always use `make install` to deploy changes.

---

## Configuration

Config lives at `~/.ubot/config.json`:

```json
{
  "server": { "port": 11490 },
  "database": { "path": "data/ubot.db" },
  "owner": {
    "phone": "",
    "telegram_id": "",
    "telegram_username": ""
  },
  "capabilities": {
    "models": {
      "default": "gemini",
      "providers": {
        "gemini": {
          "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
          "model": "gemini-2.0-flash",
          "apiKey": "YOUR_API_KEY"
        }
      }
    }
  },
  "channels": {
    "whatsapp": { "enabled": true, "auto_reply": true },
    "telegram": { "enabled": true, "token": "", "auto_reply": true },
    "imessage": { "enabled": false, "server_url": "", "password": "" }
  },
  "filesystem": {
    "allowed_paths": ["~/Documents", "~/Downloads", "~/Desktop"]
  },
  "mcp_servers": {}
}
```

### Supported LLM Providers

| Provider                  | Base URL                                                   | Notes                         |
| ------------------------- | ---------------------------------------------------------- | ----------------------------- |
| **Google Gemini**         | `https://generativelanguage.googleapis.com/v1beta/openai/` | Recommended. Fast + cheap.    |
| **OpenAI**                | `https://api.openai.com/v1`                                | GPT-4o, GPT-4, etc.           |
| **Anthropic**             | Via OpenAI-compatible proxy                                | Claude 3.5 Sonnet, etc.       |
| **Ollama**                | `http://localhost:11434/v1`                                | Local models. Free.           |
| **Any OpenAI-compatible** | Your provider's URL                                        | OpenRouter, Together AI, etc. |

---

## Skills

Skills are custom automations defined as Markdown files:

```yaml
---
name: Greeting
description: Respond to greetings warmly
triggers: [message]
filter_dms_only: true
condition: "the message is a greeting like hi, hello, hey"
outcome: reply
enabled: true
---
# Instructions
Respond warmly and ask how you can help today.
Mention the person's name if you know it.
```

Skills are stored in `~/.ubot/skills/<skill-name>/SKILL.md` and are injected as LLM context when their fast filters match an incoming message. The LLM decides whether and how to follow them.

Create skills via the web dashboard (**Skills** page), the `create_skill` tool, or by writing the files directly.

---

## Requirements

- **Node.js** ≥ 22 (via [nvm](https://github.com/nvm-sh/nvm))
- **npm** (comes with Node.js)
- **make** (pre-installed on macOS/Linux)
- **macOS** recommended (required for iMessage & Apple integrations)

---

## Contributing

Contributions welcome! Please open an issue first for major changes.

## License

MIT — Built by [Bigmints](https://bigmints.com)
