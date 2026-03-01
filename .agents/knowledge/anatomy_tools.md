# Anatomy Part 6: Tools (Registry & MCP)

The "Capabilities" of Ubot. This layer defines what the agent can actually _do_ in the physical and digital world.

## Core Components

- **`ToolRegistry`**: The central repository for all available tool executors.
- **`ToolModule`**: A logical grouping of related tools (e.g., Memory, Filesystem, Scheduler).
- **MCP Manager**: Integration point for the Model Context Protocol (MCP), allowing Ubot to connect to external tool servers.

## Mechanics

1. **Tool Discovery**: Tools are registered during system initialization. The orchestrator can query the registry for definitions to inject into the LLM's system prompt.
2. **Executor Isolation**: Each tool call is executed in a controlled environment with access to a scoped `ToolContext`.
3. **Tool Versioning**: Support for multiple versions of the same tool, allowing for graceful upgrades.

## MCP Integration

Ubot can act as an MCP host. By adding an MCP server (local or remote), Ubot instantly gains all the tools provided by that server without needing custom TypeScript wrappers. This makes Ubot infinitely extensible through the growing MCP ecosystem.
