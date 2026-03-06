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

## Tool Routing

The orchestrator integrates with `tool-router.ts` for native vs MCP deduplication:

- Native tools from auto-discovered modules
- MCP tools from connected external servers
- Alias mapping when MCP replaces a native tool
- Disconnected server filtering (MCP tools from offline servers are excluded)

## Multi-Agent Switching

Through the `switch_agent` tool, the orchestrator allows one agent to "hand off" the conversation to another by updating the `sessionAgents` map.

## Skill Integration

The orchestrator provides two function interfaces to the `SkillEngine`:

- **`generate()`**: Direct LLM text generation (no tools) — used for Phase 2 condition checks.
- **`chat()`**: Full agent loop with tools — used for skill execution with `skillContext` injection.
