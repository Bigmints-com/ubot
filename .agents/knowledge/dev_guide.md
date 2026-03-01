# Developer Guide: Extending Ubot

Ubot is designed to be easily extensible. Developers can add new capabilities by creating tool modules, MCP servers, or custom agent personas.

## 1. Creating a Tool Module

Tool modules are found in `src/tools/`. To add a new one:

1.  **Define the Interface**: Create a `ToolDefinition` with the tool name, description, and parameter schema.
2.  **Implement the Executor**: Write an asynchronous function that takes the validated arguments and returns a `ToolExecutionResult`.
3.  **Register**: Add the module to the central `ToolRegistry`.

## 2. Connecting an MCP Server

The Model Context Protocol (MCP) is the preferred way to add complex, third-party capabilities.

- **Configuration**: Add the server details (STDIO or HTTP) to the `mcp.config.json` in the workspace.
- **Discovery**: Ubot automatically polls the server, discovers its tools, and makes them available to agents (prefixed with the server name).

## 3. Drafting a Specialized Persona

Agents are defined by a single `.agent.md` file in `workspace/agents/`.

### Template:

```markdown
# Identity

Name: [Agent Name]
Description: [Single sentence role]

# Tools

- [module_name_1]
- [specific_tool_name]

# System Prompt

[Deep technical instructions and personality rules]
```

## 4. Building Automated Skills

Skills are created via the Ubot CLI or the Skills Management UI:

1.  **Trigger**: Select an event (e.g., `cron:tick`, `whatsapp:message`, `telegram:message`, `imessage:message`).
2.  **Processor**: Draft the LLM instructions for this specific automation.
3.  **Outcome**: Define the final action (e.g., `reply` or `trigger_webhook`).
