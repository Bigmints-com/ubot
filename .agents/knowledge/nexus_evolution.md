# Project Nexus: The Evolution of Ubot

A historical overview of the architectural transformation known as Project Nexus.

## Context

Ubot began as a monolithic dashboard application where agent logic was tightly coupled with a SQLite database. This made the agent's behavior difficult to audit and safe-guard. Project Nexus was launched to transition Ubot into a transparent, secure, and modular agentic framework.

## The Four Phases of Nexus

### 1. Identity Transparency

- **Goal**: Move personas and rules from DB to Markdown.
- **Key Outcome**: `IDENTITY.md` and `SOUL.md` became the primary sources of truth, enabling live-reloading of agent behavior.

### 2. Security Sandboxing

- **Goal**: Enforce strict filesystem boundaries.
- **Key Outcome**: Implementation of the `WorkspaceGuard` and sandboxed filesystem tools, ensuring the agent remains within `~/.ubot/workspace`.

### 3. Multi-Agent Orchestration

- **Goal**: Support specialized sub-agents.
- **Key Outcome**: Discovered agents in `agents/*.agent.md` and implemented dynamic switching tools, allowing Ubot to transition between different personas.

### 4. Workflow Composability

- **Goal**: Enable multi-stage pipelines.
- **Key Outcome**: Updated the Skill Engine to support modular workflow stages, enabling complex task chaining with variable substitution.

## Legacy and Impact

Project Nexus has established Ubot as a transparent and secure foundation for local-first agentic automation.
