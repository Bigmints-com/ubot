# Registry: Tools & Capabilities

A comprehensive catalog of the atomic capabilities available to Ubot agents. Currently **77 tools** across **10 modules**.

## 1. Core Orchestrator Tools

These tools are built directly into the engine for managing the session.

- **`list_agents`**: Returns a list of all specialized personas discovered in the workspace.
- **`switch_agent(agentId, sessionId)`**: Dynamically changes the active persona for a specific conversation thread.

## 2. Capability Modules

Ubot organizes tools into logical modules. Each module contains specific executors:

### 📁 Filesystem (`files.ts`) — 5 tools

Sandboxed operations within `~/.ubot/workspace` plus configurable `allowed_paths` (e.g. ~/Documents, ~/Downloads, ~/Desktop).

- **`read_file(path)`**: Read content from a file. Supports absolute paths in allowed directories.
- **`write_file(path, content)`**: Create or update a file. Auto-creates parent directories.
- **`list_files(path)`**: List contents of a directory with file sizes.
- **`delete_file(path)`**: Remove a file or directory.
- **`search_files(pattern, path?, max_depth?)`**: Search for files by name pattern (e.g. `*.pdf`, `report*`).

**Config** (`config.json`):

```json
"filesystem": {
    "allowed_paths": ["~/Documents", "~/Downloads", "~/Desktop", "~/Projects"]
}
```

### 🧠 Memory (`memory.ts`) — 3 tools

Long-term fact persistence.

- **`save_memory(fact)`**: Store a new piece of information about the user or world.
- **`get_profile(contactId)`**: Retrieve the full context for a specific contact.
- **`delete_memory(id)`**: Remove a recorded fact.

### 🌐 Web Search & Browsing (`web-search.ts`, `browser.ts`) — 9 tools

Real-time information retrieval.

- **`web_search(query)`**: Search the internet via SearXNG + Puppeteer fallback.
- **`browse_url(url)`**: Fetch and summarize the content of a specific webpage.
- Plus 7 browser tools: click, type, read, screenshot, scroll, etc.

### 📅 Scheduler (`scheduler.ts`) — 6 tools

Time-based execution.

- **`create_task(name, schedule, action)`**: Schedule a future tool call or prompt.
- **`list_tasks()`**: View upcoming and completed tasks.
- **`set_auto_reply(enabled, prompt?)`**: Configure auto-reply behavior.

### 💬 Messaging (`messaging.ts`) — 8 tools

External communication across WhatsApp, Telegram, and iMessage.

- **`send_message(to, body, channel)`**: Send a message to any supported platform.
- **`search_messages(query)`**: Search conversation history.
- Plus 6 tools: contacts, conversations, delete, reply, forward, etc.

### ⚙️ Skills (`skills.ts`) — 4 tools

Manage automated workflows.

- **`list_skills()`**: List all user-defined skills.
- **`toggle_skill(id, enabled)`**: Enable or disable an automation.

### 📧 Google Workspace (`google.ts`) — 29 tools

Full Google Workspace integration via OAuth2.

- **Gmail**: search, read, send, reply, labels, drafts
- **Drive**: list, upload, download, create folders
- **Sheets**: read, write, create, update
- **Docs**: read, create, edit
- **Calendar**: events, create, update, delete
- **Contacts**: search, create, update
- **Places**: search nearby

### 🖥️ CLI Agents (`cli.ts`) — 10 tools

Delegate coding tasks to external AI coding CLIs (Gemini, Claude, Codex).

- **`cli_triage(goal)`**: Auto-decide whether to use existing tools, create a skill, or build a new module.
- **`cli_run(prompt, project_name?)`**: Start a CLI coding session. Returns a session ID.
- **`cli_status(session_id, from_line?)`**: Check session status and read output.
- **`cli_stop(session_id)`**: Stop a running CLI session.
- **`cli_list_sessions()`**: List all sessions with status, provider, and project name.
- **`cli_send_input(session_id, input)`**: Send text input to a running session's stdin.
- **`cli_test_module(project_name)`**: Compile and validate a custom tool module.
- **`cli_promote_module(project_name)`**: Hot-load a tested module into the live registry.
- **`cli_delete_module(project_name)`**: Remove a custom module.
- **`cli_list_modules()`**: List all custom modules with status.

### ✅ Approvals (`approvals.ts`) — 3 tools

Owner approval flow for sensitive actions.

- **`ask_owner(question)`**: Escalate a decision to the owner.
- **`respond_to_approval(id, response)`**: Owner responds to a pending approval.
- **`list_pending()`**: List all pending approval requests.

## 3. External Integration (MCP)

Ubot supports any tool provided via the **Model Context Protocol**. When an MCP server is connected, its tools are automatically discovered and added to this registry with the server's prefix (e.g., `github_create_issue`).

## 4. Custom Modules

Ubot can autonomously extend itself. CLI agents build new `ToolModule` packages in `custom/staging/`, test them, and promote to `custom/modules/` for hot-loading at startup. Custom modules appear as `custom:module_name` in the registry.
