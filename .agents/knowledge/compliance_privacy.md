# Privacy & Data Sovereignty

Ubot is built with a "Privacy-First" architecture, ensuring that the owner maintains absolute control over their data.

## 1. Local-First Sovereignty

Ubot minimizes cloud dependency by design:

- **Local Storage**: All session logs, agent memories, and workspace files are stored locally on the host device.
- **No Global Sync**: There is no central Ubot cloud that aggregates or synchronizes your data. Your identity stays on your hardware.

## 2. Data Redaction

- **Context Filtering**: Ubot only sends the minimum required history and tool results to the LLM provider to complete the current task.
- **Provider Choice**: Owners can switch between external APIs (OpenAI/Anthropic) or run local models (via Ollama) to eliminate third-party data exposure entirely.

## 3. Data Control

- **Auditability**: Identity and behavior are stored as human-readable Markdown files, making it easy to see exactly what the agent "knows."
- **Erasure**: The system provides tools for granular or total purging of memory and session history from the local SQLite database and filesystem.
