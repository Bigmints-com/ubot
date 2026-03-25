# Technical Stack & Runtime

Ubot is built on a modern, asynchronous, and modular stack designed for high performance and extensibility.

## 1. Core Runtime (The Foundation)

- **Node.js**: The primary runtime environment, chosen for its non-blocking I/O and vast ecosystem of messaging and AI libraries.
- **TypeScript**: Used throughout the codebase to ensure type safety, especially critical for complex LLM orchestration and tool-calling logic.
- **ES Modules (ESM)**: Modern JavaScript module system for better performance and compatibility with modern libraries.

## 2. Persistence Layer

- **SQLite**: A lightweight, file-based database used for persistent session memory, contact profiles, conversation history, approvals, and follow-ups.
- **Skills**: Two storage backends exist. File-based skills are stored as `SKILL.md` files in `~/.ubot/skills/<skill-name>/` — human-editable, git-trackable. SQLite-backed skills are created via the `create_skill` tool or web UI and stored in the main database.
- **Durable Identity**: Soul and identity state stored as Markdown files (`IDENTITY.md`, `SOUL.md`).

## 3. Messaging Gateways (Adapters)

Ubot uses a provider-based architecture with a **Unified Message Handler** (`handler.ts`):

- **WhatsApp**: Integrated via **Baileys** (raw socket-based WhatsApp Web protocol). Supports interactive messages (buttons, lists, carousels), LID resolution, rate limiting, and media handling.
  - Session stored in `~/.ubot/sessions/ubot-session/`; scan QR via dashboard to authenticate.
- **Telegram**: Handled via **node-telegram-bot-api**, supporting the standard bot API.
- **iMessage**: Connected via **BlueBubbles**, a macOS app that exposes iMessage over a local REST API.
- **Webchat**: Poll-outbound relay via a **Cloud Run** Node.js service (`ubot-core/webchat-relay/`). UBOT polls the relay rather than exposing a public port.
- **Unified Event Bus**: All adapters normalize into `UnifiedMessage` → `SkillEvent` objects, enabling platform-agnostic processing.

## 4. AI & LLM Integration

- **OpenAI-Compatible API**: Supports any provider that implements the OpenAI chat completions API.
- **Vertex AI (Primary)**: Google Cloud Vertex AI via global endpoint. Uses **service account JWT auth** (`vertex-auth.ts`) — not static API keys. Active project: `saveaday-ai` (gen-lang-client-0951453139). Models: Gemini 2.5 Flash / Pro / Flash-Lite.
- **Per-Purpose Model Routing**: Each task type (`chat`, `router`, `generation`, `vision`) can be assigned a different model. Configured in `capabilities.models.providers.<id>.models`.
- **Usage Metering** (`src/engine/metering.ts`): Records prompt/completion tokens per model and purpose.
- **Native Tool Calling**: Uses structured function calling. Tools are formatted via `formatToolsForAPI()` and sent as the `tools` parameter.
- **Tool Selector** (`src/engine/tool-selector.ts`): Uses a fast `router`-purpose model to classify messages and select a relevant tool subset. Falls back to all tools on failure.
- **MCP (Model Context Protocol)**: Connects to external tool servers configured in `config.json` under `mcp_servers`. Active: Playwright (22 tools), Tavily (5 tools), PDF Reader (1 tool).

## 5. Tool Architecture

- **Auto-Discovery**: Tool modules are discovered from `capabilities/`, `agents/`, and `automation/` directories at startup.
- **Current Count**: 107+ native module tools + 2 orchestrator tools + MCP tools (instance-configured) = variable total. Use `cli_triage` to see the current active tool list.
- **14 Modules**: messaging, memory, sessions, files, scheduler, skills, approvals, followups, vault, apple, google, cli, exec, media, patch, web-search, web-fetch.

## 6. Deployment

- **Local**: Compiled TypeScript → `~/.ubot/lib/`, managed via `ubot` CLI (`ubot start/stop/restart/logs`). Use `make update` after changes.
- **Remote VPS**: `rsync dist/ ubot-server:/root/.ubot/lib/` + `ssh ubot-server 'ubot restart'`. See [deployment_remote.md](deployment_remote.md).
- **Development**: `npm run dev` with tsx for hot-reloading.
- **Config**: `~/.ubot/config.json` with sections for `server`, `capabilities.models`, `channels`, `filesystem`, `mcp_servers`, `owner`, and `integrations`.
- **Webchat Relay**: Separate Cloud Run service. Deploy with `cd ubot-core && ./deploy-relay.sh`.
