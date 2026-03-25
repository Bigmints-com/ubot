# Anatomy Part 3: The Orchestrator (Decision Engine)

The "How" of Ubot. The Orchestrator is the central brain that manages the lifecycle of a conversation.

## Core Components

- **`AgentOrchestrator`**: The main interface for chat and tool execution. Uses native OpenAI-compatible tool calling (works with Ollama, Gemini, OpenAI, etc.).
- **`AgentLoader`**: Responsible for discovering and parsing specialized `.agent.md` files from the workspace.
- **Agent Registry**: A Map of loaded agent definitions, allowing for dynamic persona switching.
- **`LoopDetector`**: Prevents infinite tool-calling loops by tracking recent tool call patterns.

## Message Processing Flow

1. **`buildMessages()`**: Constructs the LLM message array from conversation history, system prompt, and soul preamble.
2. **`callLLM()`**: Calls the LLM with filtered tools. Tools are filtered via `getToolsForSource(isOwner)`:
   - Owner: All native tools + connected MCP tools
   - Visitor: Only the 11 tools in `VISITOR_SAFE_TOOL_NAMES`
   - Agent-specific: Further filtered by `agent.allowedTools` if set.
3. **Tool Execution Loop**: If the LLM returns tool calls, execute them via `ToolRegistry`, feed results back, and re-call the LLM until no more tool calls.
4. **`extractSoulData()`**: After the conversation turn, extracts identity facts, contact updates, and chat summaries for long-term memory.

## LLM Provider & Auth

- **Provider selection**: Driven by `defaultLlmProviderId` in `config.json`. Provider configs live under `capabilities.models.providers`.
- **Vertex AI auth** (`src/engine/vertex-auth.ts`): When `authType === 'vertex-sa'`, the orchestrator calls `getVertexAccessToken()` which signs a JWT with the service account key and exchanges it for a short-lived OAuth2 bearer token (cached 55 min).
- **Per-purpose model routing**: `getModelForPurpose(provider, purpose)` selects the model for a given task (`chat`, `router`, `generation`, `vision`). Priority: per-purpose override → provider default → hardcoded seed in `DEFAULT_PROVIDER_MODELS`.
- **Usage metering** (`src/engine/metering.ts`): Every LLM call records prompt/completion token counts by model and purpose.

## Tool Classification & Fallback

`tool-selector.ts` uses a fast lightweight model (`router` purpose) to classify each message and select a relevant subset of tools, reducing token usage. If classification fails (e.g., 401 from provider), it falls back to **all tools** rather than failing silently.


## Multi-Agent Switching

Through the `switch_agent` tool, the orchestrator allows one agent to "hand off" the conversation to another by updating the `sessionAgents` map.

## Skill Integration

The orchestrator provides two function interfaces to the `SkillEngine`:

- **`generate()`**: Direct LLM text generation (no tools) — used for Phase 2 condition checks.
- **`chat()`**: Full agent loop with tools — used for skill execution with `skillContext` injection.
