# Technical Stack & Runtime

Ubot is built on a modern, asynchronous, and modular stack designed for high performance and extensibility.

## 1. Core Runtime (The Foundation)

- **Node.js**: The primary runtime environment, chosen for its non-blocking I/O and vast ecosystem of messaging and AI libraries.
- **TypeScript**: Used throughout the codebase to ensure type safety, especially critical for complex LLM orchestration and tool-calling logic.
- **ES Modules (ESM)**: Modern JavaScript module system for better performance and compatibility with modern libraries.

## 2. Persistence Layer

- **SQLite**: A lightweight, file-based database used for persistent session memory, contact profiles, and skill storage.
- **Durable Metadata**: Critical identity and behavior state is mirrored as **Markdown** files in the workspace (see [Markdown-as-Truth](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/principles_architectural.md)).

## 3. Messaging Gateways (Adapters)

Ubot uses a provider-based architecture to interface with different platforms:

- **WhatsApp**: Integrated via the **Baileys** library (raw socket-based WhatsApp Web protocol).
- **Telegram**: Handled via **node-telegram-bot-api**, supporting the standard bot API.
- **iMessage**: Connected via **BlueBubbles**, a macOS app that exposes iMessage over a local REST API. Ubot talks HTTP to BlueBubbles — no direct `chat.db` access needed.
- **Unified Event Bus**: All adapters emit standardized `SkillEvent` objects, allowing the engine to be platform-agnostic.

## 4. AI & LLM Integration

- **OpenAI / Anthropic APIs**: Supported through specialized provider classes.
- **Tool Calling**: Native support for tool-calling models, with fallback parsers for older or smaller LLMs.
- **MCP (Model Context Protocol)**: Support for connecting to external tool servers.

## 5. Deployment Environment

Ubot is optimized for **edge execution**:

- **Resource Footprint**: Designed to run comfortably on devices with <1GB of RAM (e.g., Raspberry Pi, old Android phones via Termux).
- **Environment Management**: Configuration is handled via `~/.ubot/config.json` (production) or `config.json` in the project root (development). Config sections include `server`, `llm`, `channels`, `filesystem`, `cli`, `owner`, and `integrations`.
