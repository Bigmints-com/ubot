# Technical Glossary

Standardized terminology mapping Ubot concepts to their technical implementations.

## Core Services & Classes

- **AgentOrchestrator**: The central engine loop that handles message processing and agent responses.
- **WorkspaceGuard**: The security class responsible for validating all filesystem operations against the workspace root.
- **SkillEngine**: The module that manages and executes automated pipelines (Trigger -> Processor -> Outcome).
- **ToolRegistry**: The central catalog where all executable `ToolModules` are registered and invoked.
- **AgentLoader**: Logic for discovering and parsing `.agent.md` persona files from the workspace.

## System Entities

- **Persona (Agent)**: A configuration file (`.agent.md`) defining an identity, system prompt, and allowed tools.
- **Soul**: The identity layer (mirroring `IDENTITY.md` and `SOUL.md`) that maintains the persistent persona across sessions.
- **Skill**: A persistent automation pipeline stored in the SQLite `SkillRepository`.
- **Tool**: A Node.js module implementing the `ToolDefinition` interface for specific capability execution.
- **Workspace**: The designated directory (`~/.ubot/workspace`) where agent file-system activity is confined by default. Additional directories can be whitelisted via `config.filesystem.allowed_paths`.

## Connectivity & Messaging

- **Messaging Adapter**: Pluggable providers (Baileys for WhatsApp, node-telegram-bot-api for Telegram, BlueBubbles for iMessage) that normalize incoming events into `SkillEvent` objects.
- **ToolContext**: A secure object passed to tools during execution, providing the `validatePath` helper and messaging hooks.
- **MCP (Model Context Protocol)**: The integration layer for connecting to external tool servers.
