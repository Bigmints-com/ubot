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
- **Telegram**: Handled via **node-telegram-bot-api**, supporting the standard bot API.
- **iMessage**: Connected via **BlueBubbles**, a macOS app that exposes iMessage over a local REST API.
- **Unified Event Bus**: All adapters normalize into `UnifiedMessage` → `SkillEvent` objects, enabling platform-agnostic processing.

## 4. AI & LLM Integration

- **OpenAI-Compatible API**: Supports any provider that implements the OpenAI chat completions API (Gemini, Ollama, OpenAI, Anthropic).
- **Native Tool Calling**: Uses structured function calling (not text parsing). Tools are formatted via `formatToolsForAPI()` and sent as the `tools` parameter.
- **MCP (Model Context Protocol)**: Connects to external tool servers. MCP connections are configured per-instance in `config.json` under `mcp_servers`. When connected, their tools appear automatically and are deduplicated by `tool-router.ts`.
- **Tool Routing**: `tool-router.ts` handles native vs MCP deduplication with alias mapping.

## 5. Tool Architecture

- **Auto-Discovery**: Tool modules are discovered from `capabilities/`, `agents/`, and `automation/` directories at startup.
- **Current Count**: 107+ native module tools + 2 orchestrator tools + MCP tools (instance-configured) = variable total. Use `cli_triage` to see the current active tool list.
- **14 Modules**: messaging, memory, sessions, files, scheduler, skills, approvals, followups, vault, apple, google, cli, exec, media, patch, web-search, web-fetch.

## 6. Deployment

- **Production**: Compiled TypeScript → `~/.ubot/lib/`, run with `node index.js`.
- **Development**: `npm run dev` with tsx for hot-reloading.
- **Config**: `~/.ubot/config.json` with sections for server, llm, channels, filesystem, mcp_servers, owner, and integrations.
