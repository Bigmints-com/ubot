# Anatomy Part 6: Tools (Registry & MCP)

The "Capabilities" of Ubot. This layer defines what the agent can actually _do_ in the physical and digital world.

## Core Components

- **`ToolRegistry`**: The central repository for all available tool executors. Tools are registered at startup and can be hot-loaded at runtime.
- **`ToolModule`**: A logical grouping of related tools (e.g., Memory, Filesystem, Scheduler). Each module defines both tool schemas (`ToolDefinition[]`) and executors.
- **MCP Manager**: Integration point for the Model Context Protocol (MCP), allowing Ubot to connect to external tool servers.

## Auto-Discovery

Tools are discovered automatically by scanning three directories:

- `capabilities/` — Feature modules (Google, Apple, CLI agents, etc.)
- `agents/` — Agent-specific tools (skills management)
- `automation/` — Automation tools (approvals, follow-ups, scheduler)

Infrastructure modules (messaging, memory, sessions) are registered explicitly.

## Tool Routing & Deduplication

When both native and MCP tools exist for the same capability, the `tool-router.ts` handles:

- **Overlap detection**: Finds tools with similar names/descriptions
- **MCP preference**: Connected MCP servers take priority over native implementations
- **Alias mapping**: Old native names redirect to MCP equivalents
- **Disconnected filtering**: MCP tools from disconnected servers are excluded

## Visitor vs Owner Tool Access

Tools are filtered based on the caller's identity:

- **Owner (isOwner: true)**: Full access to all tools (131+ including MCP)
- **Visitor (isOwner: false)**: Restricted to 11 safe tools in `VISITOR_SAFE_TOOL_NAMES`:
  `ask_owner`, `search_messages`, `get_contacts`, `get_profile`, `get_conversations`, `save_memory`, `web_search`, `web_fetch`, `list_pending_approvals`, `gcal_list_events`, `wa_respond_to_bot`

## JID Normalization

Tools that interact with WhatsApp contacts (e.g., `wa_respond_to_bot`) must handle multiple identifier formats:

- Phone numbers: `+97143020600`
- Phone JIDs: `97143020600@s.whatsapp.net`
- LID JIDs: `116986436665406@lid`

The `wa_respond_to_bot` tool normalizes automatically: if no `@` is present, it strips non-digits and appends `@s.whatsapp.net`.

## MCP Integration

Ubot acts as an MCP host. By adding an MCP server (local or remote), Ubot instantly gains all the tools provided by that server without needing custom TypeScript wrappers. MCP connections are configured per-instance. When connected, their tools appear in the owner's tool list automatically. Disconnected servers are filtered out.
