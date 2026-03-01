# Ubot — Your Personal AI Assistant

> Open-source, self-hosted AI assistant for WhatsApp, Telegram, iMessage, Gmail, and more. Runs locally. Privacy-first.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org)

## What is Ubot?

Ubot is a self-hosted AI assistant that connects to your messaging apps and automates your digital life through natural conversations. Tell it what you need in plain English — it'll browse the web, send emails, manage files, schedule tasks, and reply to people on your behalf.

**77 tools** across **10 modules** • **WhatsApp, Telegram & iMessage** • **Google Workspace** • **Browser automation** • **CLI Agents** • **File access** • **Extensible via MCP**

## ✨ Features

| Module         | Tools | What it does                                           |
| -------------- | ----- | ------------------------------------------------------ |
| **Messaging**  | 8     | Send, search, forward messages across channels         |
| **Google**     | 29    | Gmail, Drive, Sheets, Docs, Contacts, Calendar, Places |
| **Browser**    | 8     | Browse, click, type, screenshot — Puppeteer-powered    |
| **CLI**        | 10    | Delegate coding tasks to Gemini/Claude/Codex CLI       |
| **Files**      | 5     | Read, write, list, delete, search files & folders      |
| **Scheduler**  | 6     | Cron jobs, reminders, auto-reply, one-time tasks       |
| **Skills**     | 4     | Create custom automations with triggers & outcomes     |
| **Memory**     | 3     | Store & recall memories, manage personas               |
| **Web Search** | 1     | SearXNG + Puppeteer fallback                           |
| **Approvals**  | 3     | Owner approval flow for sensitive actions              |

**Plus:**

- 🤖 **Multi-LLM** — Works with OpenAI, Anthropic, Google Gemini, and Ollama (local)
- 🧠 **Soul System** — Evolving personality profiles for you and every contact
- 🔌 **MCP Servers** — Extend with any [Model Context Protocol](https://modelcontextprotocol.io/) server
- 🛡️ **Safety Rules** — Configurable guardrails for what the bot can and can't do
- 📊 **Dashboard** — Beautiful Next.js + shadcn/ui control center

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/Bigmints-com/ubot.git
cd ubot

# Install dependencies
make deps

# Build and install
make install

# Start
ubot start
```

Dashboard: [http://localhost:11490](http://localhost:11490)

### Connect Your Channels

1. Open the dashboard
2. Go to **Settings** → add your LLM API key
3. Go to **WhatsApp** → scan the QR code
4. Go to **Telegram** → enter your bot token
5. Go to **iMessage** → enter your BlueBubbles server URL and password
6. Go to **Google** → connect your Google account

## 🖥️ CLI

```bash
ubot start           # Start on port 11490
ubot stop            # Graceful shutdown
ubot restart         # Stop + start
ubot status          # Show PID, port, dashboard URL
ubot logs            # Last 50 log lines
ubot logs -f         # Follow logs
ubot config          # Show current config
ubot config edit     # Open config in $EDITOR
ubot config set k v  # Set a config value
ubot config get k    # Get a config value
ubot doctor          # Health check
ubot open            # Open dashboard in browser
ubot version         # Version info
```

## 🛠️ Development

```bash
./start.sh           # Backend on :4081 + Next.js UI on :4080 (hot reload)
./stop.sh            # Stop dev servers
npx vitest           # Run tests
```

## 🏗️ Architecture

```
ubot/
├── Makefile              # Build + install pipeline
├── start.sh / stop.sh    # Dev mode scripts
├── cli/                  # CLI (ubot start/stop/status/logs)
└── ubot-core/            # Main application
    ├── src/
    │   ├── api/           # REST API endpoints
    │   ├── engine/        # AI orchestrator, LLM, prompt builder, memory
    │   ├── tools/         # 77 tools in 10 modules
    │   ├── channels/      # WhatsApp, Telegram & iMessage adapters
    │   ├── integrations/  # Google Workspace, MCP servers
    │   ├── capabilities/  # Browser, Scheduler, Skill engine, CLI agents
    │   ├── data/          # SQLite database & config
    │   ├── safety/        # Safety rules & guardrails
    │   └── logger/        # Structured logging
    └── web/               # Next.js + shadcn/ui dashboard
```

## ⚙️ Configuration

Config lives at `~/.ubot/config.json`:

```json
{
  "server": { "port": 11490 },
  "database": { "path": "data/ubot.db" },
  "llm": {
    "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "model": "gemini-2.0-flash",
    "api_key": "YOUR_API_KEY"
  },
  "integrations": { "serper_api_key": "" },
  "channels": {
    "whatsapp": { "enabled": false },
    "telegram": { "enabled": false, "token": "" },
    "imessage": { "enabled": false, "server_url": "", "password": "" }
  },
  "filesystem": {
    "allowed_paths": ["~/Documents", "~/Downloads", "~/Desktop"]
  }
}
```

Supports **OpenAI**, **Anthropic**, **Google Gemini**, and **Ollama** (local).

## 📋 Requirements

- **Node.js** ≥ 22 (via [nvm](https://github.com/nvm-sh/nvm))
- **npm** (comes with Node.js)
- **make** (pre-installed on macOS/Linux)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

MIT — Built by [Bigmints](https://bigmints.com)
