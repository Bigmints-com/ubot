# Developer Guide: Extending Ubot

Ubot is designed to be easily extensible. Developers can add new capabilities by creating tool modules, MCP servers, skills, or custom agent personas.

## 1. Creating a Tool Module

Tool modules are auto-discovered from `src/capabilities/`, `src/agents/`, and `src/automation/`. To add a new one:

1. **Create a directory** under one of the scan directories (e.g., `src/capabilities/my-feature/`)
2. **Create `index.ts`** that exports `toolModules: ToolModule[]`
3. **Define tools**: Each `ToolModule` has `name`, `tools: ToolDefinition[]`, and a `register(registry, ctx)` function
4. **Register executors**: In the `register` function, call `registry.register('tool_name', async (args) => { ... })`

Infrastructure modules (messaging, memory, sessions) are registered explicitly in `src/tools/registry.ts`.

### JID Normalization for WhatsApp Tools

If your tool sends WhatsApp messages, normalize the JID before calling `sendMessage`:

```typescript
if (!to.includes("@")) {
  const digits = to.replace(/\D/g, "");
  to = `${digits}@s.whatsapp.net`;
}
```

## 2. Connecting an MCP Server

The Model Context Protocol (MCP) is the preferred way to add complex, third-party capabilities.

- **Configuration**: Add server details to `~/.ubot/config.json` under `mcp_servers`
- **Discovery**: Ubot automatically discovers tools and registers them with deduplication
- **Tool Routing**: Native tool names are aliased to MCP equivalents when an MCP server provides a better implementation

## 3. Drafting a Specialized Persona

Agents are defined by a single `.agent.md` file in `~/.ubot/workspace/agents/`.

## 4. Building Automated Skills

There are two ways to create a skill:

### a) File-based (manually authored)

Create `~/.ubot/skills/<skill-name>/SKILL.md`:

```yaml
---
name: My Skill
description: What it does
triggers: [whatsapp:message]
filter_dms_only: true
condition: LLM condition for phase 2 matching
outcome: reply
enabled: true
---
# Instructions

Skill instructions for the LLM.
```

### b) Programmatic (via tool or web UI)

Use the `create_skill` tool to create a SQLite-backed skill with the Trigger → Processor → Outcome structure:

```
create_skill(
  name: "My Skill",
  description: "What it does",
  instructions: "Natural language instructions for the LLM",
  events: "whatsapp:message",
  condition: "when the message is about pricing",
  outcome: "reply"
)
```

Both formats are loaded and executed by the same `SkillEngine`. File-based skills are identified by their directory name as ID; SQLite skills use a generated `sk_<timestamp>` ID.

### Adding a Visitor-Safe Tool

If a skill needs to call a tool during visitor sessions, add the tool name to `VISITOR_SAFE_TOOL_NAMES` in `src/engine/tools.ts`.

## 5. Build & Deploy

```bash
cd ubot-core
npm run build                          # Compiles TypeScript to dist/
cp -R dist/* ~/.ubot/lib/             # Deploy to production
kill $(pgrep -f "node.*ubot/lib")     # Stop old process
UBOT_HOME=~/.ubot node ~/.ubot/lib/index.js  # Start new process
```

## 6. Maintenance Rule

> **IMPORTANT**: When adding or removing tools, update `/.agents/knowledge/registry_tools.md` with the new tool name, description, and parameters. This file is the reference for all available tools and must be kept in sync with the codebase.
