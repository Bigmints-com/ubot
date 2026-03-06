# Technical Glossary

Standardized terminology mapping Ubot concepts to their technical implementations.

## Core Services & Classes

- **AgentOrchestrator**: The central engine loop that handles message processing, LLM calls, tool execution, and response generation. Uses native OpenAI-compatible tool calling.
- **SkillEngine**: The module that manages automated pipelines (Trigger → Processor → Outcome). Supports two-phase event matching and owner context injection.
- **ToolRegistry**: The central catalog where all executable `ToolModules` are registered and invoked. Includes alias resolution for MCP tool routing.
- **ToolRouter**: Deduplicates and routes between native and MCP tools, handling overlaps and generating aliases.
- **EventBus**: Emits `SkillEvent` objects to skill engine for matching and processing.
- **LoopDetector**: Prevents infinite tool-calling loops in the agent chat cycle.

## System Entities

- **Persona (Agent)**: A configuration file (`.agent.md`) defining an identity, system prompt, and allowed tools.
- **Soul**: The identity layer (mirroring `IDENTITY.md` and `SOUL.md`) that maintains the persistent persona across sessions.
- **Skill**: An automated Trigger → Processor → Outcome pipeline. Two storage backends: file-based (`SKILL.md` in `~/.ubot/skills/<skill-name>/`, manually authored) or SQLite-backed (created via `create_skill` tool or web UI). Both are loaded and run by the same `SkillEngine`.
- **Tool**: A capability executor implementing the `ToolDefinition` interface. Registered in modules (ToolModule) and auto-discovered from capability directories.
- **Workspace**: `~/.ubot/` — the root directory containing config, skills, sessions, data, and lib.

## Connectivity & Messaging

- **UnifiedMessage**: The standardized message format used by `handleIncomingMessage()` in `handler.ts`. All channels normalize into this format.
- **Messaging Provider**: Channel-specific adapters (Baileys for WhatsApp, node-telegram-bot-api for Telegram, BlueBubbles for iMessage).
- **LID (Linked ID)**: WhatsApp's alternative JID format (`127058135019537@lid`). Must be resolved to phone JIDs (`971569737344@s.whatsapp.net`) for owner detection and routing.
- **JID (Jabber ID)**: WhatsApp's identifier format for contacts (`number@s.whatsapp.net`) and groups (`id@g.us`).
- **ToolContext**: A secure object passed to tools during execution, providing messaging hooks, WhatsApp connection access, and workspace paths.
- **MCP (Model Context Protocol)**: Integration layer for connecting to external tool servers. Configured per-instance in `config.json`. Connected servers have their tools automatically discovered and deduplicated.
- **VISITOR_SAFE_TOOL_NAMES**: The 11-tool allowlist for non-owner sessions: `ask_owner`, `search_messages`, `get_contacts`, `get_profile`, `get_conversations`, `save_memory`, `web_search`, `web_fetch`, `list_pending_approvals`, `gcal_list_events`, `wa_respond_to_bot`. Defined in `engine/tools.ts`.

## Security Concepts

- **Owner Detection**: Single source of truth in `handler.ts`. Web = always owner. WhatsApp = phone match. Telegram = ID or username match.
- **Session Routing**: Owner messages route to `web-console`. Visitor messages route to channel-specific sessions (WhatsApp JID, `telegram:chatId`).
- **Rate Limiter**: Human-like send delays for WhatsApp outbound messages (per-minute, per-hour, per-day limits).
