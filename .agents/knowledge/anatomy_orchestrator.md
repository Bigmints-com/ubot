# Anatomy Part 3: The Orchestrator (Decision Engine)

The "How" of Ubot. The Orchestrator is the central brain that manages the lifecycle of a conversation.

## Core Components

- **`AgentOrchestrator`**: The main interface for chat and tool execution.
- **`AgentLoader`**: Responsible for discovering and parsing specialized `.agent.md` files from the workspace.
- **Agent Registry**: A Map of loaded agent definitions, allowing for dynamic persona switching.

## Mechanics

1. **Session Context Management**: Tracks which agent is active for a specific session ID (e.g., WhatsApp JID).
2. **Tool Filtering**: When an LLM call is made, the Orchestrator filters the global tool registry based on the active agent's `allowedTools` list.
3. **System Prompt Composition**: Combines the static agent definition with dynamic Soul preambles to create a personalized instruction set for the LLM.

## Multi-Agent Switching

Through the `switch_agent` tool, the orchestrator allows one agent to "hand off" the conversation to another. This is handled by updating the `sessionAgents` map, ensuring that subsequent messages in the same thread use the new persona.
