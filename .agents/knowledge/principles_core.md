# Core Principles of Ubot

The foundational values that guide the development and behavior of Ubot.

## 1. Transparency (Human-Readable Intelligence)

Ubot believes that an agent's logic should not be hidden in a database.

- **Source of Truth**: All behavioral definitions, personas, and system prompts are stored as human-editable Markdown files.
- **Auditability**: Owners can see exactly what the agent "knows" and how it is instructed to behave by simply reading a file.
- **Portability**: Identity and evolution are decoupled from the infrastructure, allowing for easy migration and version control.

## 2. Security (Assumed Mistrust)

As an agentic platform, Ubot operates under the principle of "least privilege" for LLM-driven actions.

- **Workspace Isolation**: Agents are strictly confined to a designated workspace directory.
- **Recursive Validation**: Every file-system tool call is validated against the workspace root to prevent path traversal attacks.
- **Explicit Access**: Sensitive operations require clear owner escalation or predefined safety rules.

## 3. Modularity (Composable Capabilities)

Ubot is designed as a platform of pluggable components, not a monolithic application.

- **Role-Based Agents**: Support for specialized personas that can be swapped or combined.
- **Decoupled Connectivity**: Messaging providers (WhatsApp, Telegram) are interchangeable adapters.
- **Extensible Tools**: A registry-based system makes it easy to add new capabilities or integrate third-party MCP servers.
