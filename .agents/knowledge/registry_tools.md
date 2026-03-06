# Registry: Tools & Capabilities

A comprehensive catalog of the atomic capabilities available to Ubot agents. Currently **107+ native tools** across **16 modules**, plus 2 core orchestrator tools and dynamically discovered MCP tools.

> **Quick reference**: See [tools_reference.md](file:///Users/pretheesh/Projects/ubot/.agents/knowledge/tools_reference.md) for a flat table of every tool name and description.

## 1. Core Orchestrator Tools

These tools are built directly into the engine for managing the session.

- **`list_agents`**: Returns a list of all specialized personas discovered in the workspace.
- **`switch_agent(agentId, sessionId)`**: Dynamically changes the active persona for a specific conversation thread.

## 2. Capability Modules

Ubot organizes tools into logical modules. Each module contains specific executors:

### 📁 Filesystem (`capabilities/filesystem/tools.ts`) — 5 tools

Sandboxed operations within `~/.ubot/workspace` plus configurable `allowed_paths` (e.g. ~/Documents, ~/Downloads, ~/Desktop).

- **`read_file(path)`**: Read content from a file. Supports absolute paths in allowed directories.
- **`write_file(path, content)`**: Create or update a file. Auto-creates parent directories.
- **`list_files(path?)`**: List contents of a directory with file sizes.
- **`delete_file(path)`**: Remove a file or directory.
- **`search_files(pattern, path?, max_depth?)`**: Search for files by name pattern (e.g. `*.pdf`, `report*`).

**Config** (`config.json`):

```json
"filesystem": {
    "allowed_paths": ["~/Documents", "~/Downloads", "~/Desktop", "~/Projects"]
}
```

### 🧠 Memory (`memory/tools.ts`) — 3 tools

Long-term fact persistence.

- **`save_memory(contactId, category, key, value)`**: Store a fact about a person. Categories: identity, preference, fact, relationship, note. Use `__owner__` for the owner profile.
- **`get_profile(contactId)`**: Retrieve all known facts for a specific contact.
- **`delete_memory(memoryId)`**: Remove a recorded fact by its ID.

### 🌐 Web (`capabilities/web-search/tools.ts`, `fetch-tools.ts`) — 2 tools

Real-time information retrieval.

- **`web_search(query, max_results?)`**: Search the internet via Serper → DuckDuckGo → Puppeteer fallback chain.
- **`web_fetch(url, extract_mode?, max_chars?)`**: Fetch and extract content from a URL as markdown or plain text. No browser needed; for JS-heavy SPAs use Playwright MCP's `browse_url`.

### 📅 Scheduler (`automation/scheduler/tools.ts`) — 7 tools

Time-based execution. All time inputs support chrono-node natural language ("in 30 minutes", "tomorrow at 9am").

- **`schedule_message(to, body, time, channel?)`**: Schedule a message to be sent to a contact at a specific future time.
- **`set_auto_reply(contacts, instructions, enabled)`**: Configure automatic replies for specific contacts (or `"all"`) with given instructions.
- **`create_reminder(message, time, recurrence?)`**: Create a reminder for the owner. Delivered via Telegram or WhatsApp. Recurrence: once, daily, weekly, monthly.
- **`list_schedules(status?)`**: List all active scheduled tasks, reminders, and messages. Filter by status.
- **`delete_schedule(task_id)`**: Cancel and delete a scheduled task or reminder by its ID.
- **`trigger_schedule(task_id)`**: Run a scheduled task immediately, regardless of its next scheduled time.
- **`schedule_agent_task(task, time, recurrence?, channel?)`**: Schedule a recurring agent task that runs full tool loops and sends dynamic results (daily briefs, live reports, monitoring).

### 💬 Messaging (`channels/tools.ts`) — 13 tools

External communication across WhatsApp, Telegram, and iMessage.

- **`send_message(to, body, channel?)`**: Send a message to any supported platform. Auto-detects channel based on recipient format.
- **`search_messages(from?, to?, query?, limit?, channel?)`**: Search conversation history across all channels.
- **`get_contacts(query?, channel?)`**: Look up contact information by name or number.
- **`get_conversations(limit?, channel?)`**: List recent conversations.
- **`delete_message(messageId, channel?)`**: Delete a specific message.
- **`edit_message(messageId, body, channel?)`**: Edit the body of a previously sent message. Supported on WhatsApp and Telegram.
- **`reply_to_message(messageId, body, channel?)`**: Reply quoting the original message.
- **`forward_message(to, text, channel?)`**: Forward message text to another chat. Use `search_messages` to find the content first.
- **`react_to_message(messageId, emoji, channel?)`**: React with an emoji (WhatsApp, Telegram, iMessage tapback).
- **`pin_message(messageId, channel?)`**: Pin a message in a chat.
- **`create_poll(to, question, options, channel?)`**: Create a poll (WhatsApp, Telegram). Options is comma-separated.
- **`get_connection_status(channel?)`**: Check whether a messaging channel is connected and ready. Omit `channel` to check all.
- **`wa_respond_to_bot(to, response)`**: Send a selection/reply to a WhatsApp bot. Handles JID normalization — accepts phone numbers (`+97143020600`), JIDs (`97143020600@s.whatsapp.net`), or LIDs. **Also available to visitor sessions** (in `VISITOR_SAFE_TOOL_NAMES`).

### ⚙️ Skills (`agents/skills/tools.ts`) — 4 tools

Manage automated Trigger → Processor → Outcome pipelines.

- **`list_skills()`**: List all user-defined skills with their events, condition, and outcome.
- **`create_skill(name, description, instructions, ...)`**: Create a new skill. Provide `stages` JSON for a multi-stage pipeline; otherwise single-instruction mode.
- **`update_skill(skill_id, ...)`**: Modify an existing skill (trigger, processor, outcome, or filters).
- **`delete_skill(skill_id)`**: Delete a skill by ID.

### 📧 Google Workspace (`capabilities/google/tools.ts`) — 29 tools

Full Google Workspace integration via OAuth2. Use `google_auth_status` to verify connection.

- **Gmail** (6): `gmail_list`, `gmail_read`, `gmail_send`, `gmail_reply`, `gmail_search`, `gmail_trash`
- **Drive** (6): `drive_list`, `drive_search`, `drive_download`, `drive_upload`, `drive_share`, `drive_create_folder`
- **Sheets** (4): `sheets_read`, `sheets_write`, `sheets_create`, `sheets_list_tabs`
- **Docs** (2): `docs_read`, `docs_create`
- **Contacts** (3): `google_contacts_list`, `google_contacts_search`, `google_contacts_create`
- **Calendar** (4): `gcal_list_events`, `gcal_create_event`, `gcal_update_event`, `gcal_delete_event`
- **Places** (3): `google_places_search`, `google_places_details`, `google_places_nearby`
- **Auth** (1): `google_auth_status`

### 🖥️ CLI Agents (`capabilities/cli/tools.ts`) — 10 tools

Delegate coding tasks to external AI coding CLIs (Gemini, Claude, Codex). Gated behind `config.capabilities.cli.enabled`.

- **`cli_triage(request)`**: **Always call before `cli_run`.** Evaluates whether existing tools/skills handle the request, or if new code is needed. Verdict: exists / skill / tool / reject.
- **`cli_run(prompt, project_name?)`**: Start a CLI coding session. Returns a session ID.
- **`cli_status(session_id, from_line?)`**: Check session status and read output incrementally.
- **`cli_stop(session_id)`**: Stop a running CLI session.
- **`cli_list_sessions()`**: List all sessions with status, provider, and project name.
- **`cli_send_input(session_id, input)`**: Send text input to a running session's stdin.
- **`cli_test_module(module_name)`**: Validate a staged custom tool module before promoting.
- **`cli_promote_module(module_name)`**: Hot-load a tested module into the live registry. Tools available immediately.
- **`cli_list_modules()`**: List all custom modules (staged and live) with tool counts.
- **`cli_delete_module(module_name, target?)`**: Remove a custom module from staging, live, or both.

### ✅ Approvals (`automation/approvals/tools.ts`) — 3 tools

Owner approval flow for sensitive actions. When an approval is created, the owner is notified via WhatsApp and Telegram.

- **`ask_owner(question, context, requester_jid)`**: Escalate a decision to the owner. Also available to visitor sessions.
- **`respond_to_approval(approval_id?, response)`**: Owner responds to a pending approval. Response is relayed to the requester's session.
- **`list_pending_approvals()`**: List all pending approval requests. Also available to visitor sessions.

### ⏰ Follow-Ups (`automation/followups/tools.ts`) — 5 tools

Conversation continuity tracking. Ensures no conversation with unresolved items is forgotten.

- **`schedule_followup(session_id, contact_id, channel, reason, context, time?, priority?, max_attempts?)`**: Schedule a follow-up check. Time uses natural language ("in 2 hours", "tomorrow at 9am"). Default: 1 hour.
- **`list_followups(status?, contact_id?, channel?)`**: List follow-ups filtered by status, contact, or channel. Status values: pending, completed, cancelled, expired, all.
- **`complete_followup(followup_id, result)`**: Mark a follow-up as resolved with a description of how it was closed.
- **`cancel_followup(followup_id, reason?)`**: Cancel a pending follow-up that is no longer needed.
- **`get_conversation_status(session_id)`**: Check if a session has pending, overdue, or upcoming follow-ups. Use at the start of a conversation with a returning contact.

### 🔐 Vault (`agents/vault/tools.ts`) — 5 tools

Encrypted storage for secrets and sensitive documents. Owner-only.

- **`vault_store(label, value, category?, notes?)`**: Store sensitive text securely. Categories: general, credentials, identity, finance, documents, keys, notes.
- **`vault_store_document(label, file_path, category?, notes?)`**: Encrypt and store a file (image, PDF, document) in the vault.
- **`vault_retrieve(label)`**: Retrieve a stored item by label or ID. Returns decrypted value for text, metadata for documents.
- **`vault_list(category?, search?)`**: List all vault items. Shows labels and categories — NOT the values.
- **`vault_delete(label)`**: Permanently delete an item from the vault. Cannot be undone.

### 🍎 Apple (`capabilities/apple/tools.ts`) — 11 tools

macOS/iOS integration via AppleScript.

- **Calendar** (3): `apple_cal_list_events`, `apple_cal_create_event`, `apple_cal_delete_event`
- **Contacts** (2): `apple_contacts_list`, `apple_contacts_search`
- **Notes** (3): `apple_notes_list`, `apple_notes_read`, `apple_notes_create`
- **Mail** (3): `apple_mail_list`, `apple_mail_read`, `apple_mail_send`

### 🛠️ Exec (`capabilities/cli/exec-tools.ts`) — 2 tools

Direct shell command execution. Owner-only. Security mode configurable in `config.capabilities.exec`.

- **`exec(command, timeout?, background?, cwd?)`**: Run a shell command. Set `background: true` for long-running commands — returns a `session_id` immediately.
- **`process(action, session_id?, lines?)`**: Manage background exec sessions. Actions: `list`, `poll` (output delta), `log` (last N lines), `kill`.

### 🩹 Patch (`capabilities/filesystem/patch-tools.ts`) — 1 tool

- **`apply_patch(path, patch)`**: Apply a unified diff patch to a file. Standard `@@ -line,count +line,count @@` format. Returns hunks applied/rejected count.

### 🖼️ Media (`capabilities/filesystem/media-tools.ts`) — 3 tools

Document and image processing. Same path security as the filesystem module.

- **`extract_pdf_text(path, max_pages?)`**: Extract text content from a PDF file (up to 50MB, 100K chars).
- **`extract_document_text(path)`**: Read and extract text from common formats: txt, md, csv, json, html, xml, log.
- **`describe_image(path)`**: Load an image file and encode it for the LLM to visually analyze (png, jpg, gif, webp).

## 3. Visitor Security — `VISITOR_SAFE_TOOL_NAMES`

Non-owner (visitor) sessions are restricted to **11 tools**:
`ask_owner`, `search_messages`, `get_contacts`, `get_profile`, `get_conversations`, `save_memory`, `web_search`, `web_fetch`, `list_pending_approvals`, `gcal_list_events`, `wa_respond_to_bot`.

All other tools are owner-only to prevent information leakage.

## 4. External Integration (MCP)

Ubot supports any tool provided via the **Model Context Protocol**. When an MCP server is connected, its tools are automatically discovered and added to this registry. Tool routing automatically handles name conflicts between native and MCP tools. MCP connections are configured per-instance in `config.json` under `mcp_servers`.

## 5. Custom Modules

Ubot can autonomously extend itself. CLI agents build new `ToolModule` packages in `custom/staging/`, test them with `cli_test_module`, and promote to `custom/modules/` for hot-loading. Use `cli_list_modules()` to see active custom modules.
