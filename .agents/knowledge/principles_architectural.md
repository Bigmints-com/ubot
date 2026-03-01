# Architectural Principles: The Three Pillars

The technical strategies used to enforce Ubot's core principles.

## 1. Markdown-as-Truth

This pillar shifts the "state" of the agent from opaque database records to transparent Markdown documents.

- **Implementation**: The `Soul` module synchronizes internal state with `IDENTITY.md` and `SOUL.md`.
- **Live Sync**: Uses filesystem watchers (`fs.watch`) to reload personality and rules in real-time when the files are edited by the user.
- **Benefit**: Zero-friction tuning of the agent's behavior.

## 2. Workspace Containment (The Sandbox)

Architectural enforcement of security boundaries.

- **Implementation**: The `WorkspaceGuard` component in the `SafetyService`.
- **Enforcement**: All tool modules that interact with the filesystem must resolve paths through the validator.
- **Default Root**: `~/.ubot/workspace`. No tool can read or write outside this directory tree without explicit, manual configuration.

## 3. Tool-Centric Orchestration

The Ubot core engine is built around a decision-making loop that treats tools as first-class citizens.

- **Implementation**: A centralized `ToolRegistry` that provides a unified interface for the LLM to discover and execute capabilities.
- **Context Awareness**: The orchestrator provides tools with a `ToolContext`, giving them safe access to messaging, scheduling, and workspace paths.
- **Multi-Stage Workflows**: The ability to chain these tools together into semi-autonomous pipelines (Skills).
