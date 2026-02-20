# Ubot — Your Personal AI Assistant

> Chat-powered automation for WhatsApp, Telegram, Gmail, and more. Runs locally, thinks globally.

## What is Ubot?

Ubot is a self-hosted AI assistant that connects to your messaging apps and automates your digital life through natural conversations. Tell it what you need in plain English — it'll browse the web, send emails, manage files, schedule tasks, and reply to people on your behalf.

**59 tools** across **7 modules** • **WhatsApp & Telegram** • **Google Workspace** • **Browser automation** • **Privacy-first (runs on your machine)**

## Quick Start

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

## CLI

```bash
ubot start           # Start on port 11490
ubot stop            # Graceful shutdown
ubot status          # Show PID, port, dashboard URL
ubot logs            # Last 50 log lines
ubot logs -f         # Follow logs
ubot version         # Version info
```

## Development

```bash
./start.sh           # Backend on :4081 + Next.js UI on :4080 (hot reload)
./stop.sh            # Stop dev servers
```

## Features

| Module         | Tools | What it does                                           |
| -------------- | ----- | ------------------------------------------------------ |
| **Messaging**  | 8     | Send, search, forward messages across channels         |
| **Google**     | 29    | Gmail, Drive, Sheets, Docs, Contacts, Calendar, Places |
| **Browser**    | 8     | Browse, click, type, screenshot — Puppeteer-powered    |
| **Scheduler**  | 6     | Cron jobs, reminders, auto-reply, one-time tasks       |
| **Skills**     | 4     | Create custom automations with triggers & outcomes     |
| **Web Search** | 1     | SearXNG + Puppeteer fallback                           |
| **Approvals**  | 3     | Owner approval flow for sensitive actions              |

## Architecture

```
ubot/
├── Makefile              # Build + install pipeline
├── start.sh / stop.sh    # Dev mode scripts
├── cli/                  # CLI (ubot start/stop/status/logs)
└── ubot-core/            # Main application
    ├── src/
    │   ├── api/           # REST API endpoints
    │   ├── engine/        # AI orchestrator, LLM, personas, memory
    │   ├── tools/         # 59 tools in 7 modules
    │   ├── channels/      # WhatsApp, Telegram, Google Workspace
    │   ├── capabilities/  # Browser, Scheduler, Skills engine
    │   ├── data/          # Database, config, safety
    │   └── logger/        # Logging + ring buffer
    └── web/               # Next.js + shadcn/ui dashboard
```

## Configuration

Config lives at `~/.ubot/config.json`:

```json
{
  "server": { "port": 11490 },
  "llm": {
    "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "model": "gemini-2.0-flash",
    "api_key": "YOUR_API_KEY"
  }
}
```

Supports **OpenAI**, **Anthropic**, **Google Gemini**, and **Ollama** (local).

## Requirements

- **Node.js** ≥ 22 (via [nvm](https://github.com/nvm-sh/nvm))
- **npm** (comes with Node.js)
- **make** (pre-installed on macOS/Linux)

## License

MIT — Built by [Bigmints](https://bigmints.com)
