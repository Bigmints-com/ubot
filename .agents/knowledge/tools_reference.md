# Tool Reference — Complete Name & Description Index

Every tool available in Ubot, with exact names and descriptions as defined in source. Organized by module. Source paths are relative to `ubot-core/src/`.

---

## Core Orchestrator (`engine/tools.ts`)

| Tool | Description |
|------|-------------|
| `list_agents` | List all available specialized agents (personas) in the workspace |
| `switch_agent(agentId, sessionId)` | Switch the active agent persona for the current session |

---

## 📁 Filesystem (`capabilities/filesystem/tools.ts`)

Sandboxed to `~/.ubot/workspace` plus any `allowed_paths` configured in `config.json`.

| Tool | Description |
|------|-------------|
| `read_file(path)` | Read the contents of a file. Supports absolute paths in allowed directories |
| `write_file(path, content)` | Write or overwrite a file. Creates parent directories automatically |
| `list_files(path?)` | List files and directories with sizes |
| `delete_file(path)` | Delete a file or directory |
| `search_files(pattern, path?, max_depth?)` | Search for files by name pattern (e.g. `*.pdf`, `report*`) |

---

## 🧠 Memory (`memory/tools.ts`)

Long-term fact persistence per contact, backed by SQLite.

| Tool | Description |
|------|-------------|
| `save_memory(contactId, category, key, value)` | Remember a fact, preference, or note about a person. Categories: identity, preference, fact, relationship, note |
| `get_profile(contactId)` | Look up everything known about a person — name, job, preferences, past notes. Use `__owner__` for the owner profile |
| `delete_memory(memoryId)` | Delete a specific memory fact by its ID. Use `get_profile` first to find the ID |

---

## 🌐 Web (`capabilities/web-search/tools.ts`, `fetch-tools.ts`)

| Tool | Description |
|------|-------------|
| `web_search(query, max_results?)` | Search the internet for current events, facts, or any real-world information. Tries Serper → DuckDuckGo → Puppeteer in order |
| `web_fetch(url, extract_mode?, max_chars?)` | Fetch a URL and extract content as markdown or plain text. Fast, no browser. Use `browse_url` (Playwright MCP) for JS-heavy SPAs |

---

## 📅 Scheduler (`automation/scheduler/tools.ts`)

All time inputs support chrono-node natural language ("in 30 minutes", "tomorrow at 9am").

| Tool | Description |
|------|-------------|
| `schedule_message(to, body, time, channel?)` | Schedule a message to be sent to a contact at a specific future time |
| `set_auto_reply(contacts, instructions, enabled)` | Configure automatic replies for specific contacts (or "all") with given instructions |
| `create_reminder(message, time, recurrence?)` | Create a reminder for the owner. Delivered via Telegram or WhatsApp. Recurrence: once, daily, weekly, monthly |
| `list_schedules(status?)` | List all active scheduled tasks, reminders, and messages. Filter by status: pending, running, completed, failed, cancelled, paused |
| `delete_schedule(task_id)` | Cancel and delete a scheduled task or reminder by its ID |
| `trigger_schedule(task_id)` | Run a scheduled task immediately, regardless of its next scheduled time |
| `schedule_agent_task(task, time, recurrence?, channel?)` | Schedule a recurring agent task that runs tools and sends dynamic results. Unlike `create_reminder` (static text), this spawns a full agent at the scheduled time |

---

## 💬 Messaging (`channels/tools.ts`)

Multi-channel: WhatsApp, Telegram, iMessage. Channel auto-detected from recipient format if not specified.

| Tool | Description |
|------|-------------|
| `send_message(to, body, channel?)` | Send a text message to any supported platform |
| `search_messages(from?, to?, query?, limit?, channel?)` | Search conversation history across all channels |
| `get_contacts(query?, channel?)` | Look up contact information by name, phone number, or ID |
| `get_conversations(limit?, channel?)` | List recent conversations |
| `delete_message(messageId, channel?)` | Delete a specific message |
| `edit_message(messageId, body, channel?)` | Edit the body of a previously sent message. Supported on WhatsApp and Telegram |
| `reply_to_message(messageId, body, channel?)` | Reply quoting the original message |
| `forward_message(to, text, channel?)` | Forward message text to another chat. Use `search_messages` to find the content first |
| `react_to_message(messageId, emoji, channel?)` | React with an emoji (WhatsApp, Telegram, iMessage tapback) |
| `pin_message(messageId, channel?)` | Pin a message in a chat |
| `create_poll(to, question, options, channel?)` | Create a poll (WhatsApp, Telegram). Options is comma-separated |
| `get_connection_status(channel?)` | Check whether a messaging channel is connected and ready. Omit `channel` for all channels |
| `wa_respond_to_bot(to, response)` | Send a selection/reply to a WhatsApp bot. Handles JID normalization (phone, JID, or LID). **Visitor-safe** |

---

## ⚙️ Skills (`agents/skills/tools.ts`)

Manage Trigger → Processor → Outcome automated pipelines.

| Tool | Description |
|------|-------------|
| `list_skills()` | List all skills (automated pipelines) with their events, condition, and outcome |
| `create_skill(name, description, instructions, events?, condition?, contacts?, groups?, groups_only?, pattern?, outcome?, outcome_target?, enabled?, stages?)` | Create a new skill. Provide `stages` JSON for a multi-stage pipeline, otherwise single-instruction mode |
| `update_skill(skill_id, name?, description?, instructions?, events?, condition?, contacts?, groups?, groups_only?, pattern?, outcome?, outcome_target?, enabled?)` | Modify any property of an existing skill |
| `delete_skill(skill_id)` | Delete a skill by its ID |

---

## 📧 Google Workspace (`capabilities/google/tools.ts`)

Full Google Workspace integration via OAuth2. Requires running `google_auth_status` to verify connection.

### Gmail (6 tools)

| Tool | Description |
|------|-------------|
| `gmail_list(query?, max_results?)` | List emails from the inbox. Supports Gmail search syntax (e.g. `is:unread`, `from:alice@example.com`) |
| `gmail_read(message_id)` | Read the full content of an email by its ID |
| `gmail_send(to, subject, body, cc?, bcc?)` | Send an email |
| `gmail_search(query, max_results?)` | Search Gmail with any query |
| `gmail_trash(message_id)` | Move an email to trash |
| `gmail_reply(message_id, body)` | Reply to an email thread |

### Google Drive (6 tools)

| Tool | Description |
|------|-------------|
| `drive_list(query?, max_results?, folder_id?)` | List files in Drive. Supports Drive search syntax |
| `drive_search(query, max_results?)` | Search files by name or content keyword |
| `drive_download(file_id)` | Download a file from Drive |
| `drive_upload(name, content, folder_id?)` | Upload a text file to Drive |
| `drive_share(file_id, email, role?)` | Share a file with someone. Role: reader, writer, commenter |
| `drive_create_folder(name, parent_id?)` | Create a new folder |

### Google Sheets (4 tools)

| Tool | Description |
|------|-------------|
| `sheets_read(spreadsheet_id, range)` | Read cells from a spreadsheet using A1 notation (e.g. `Sheet1!A1:D10`) |
| `sheets_write(spreadsheet_id, range, values)` | Write values to a range. `values` is a JSON array of arrays |
| `sheets_create(title, sheet_names?)` | Create a new spreadsheet |
| `sheets_list_tabs(spreadsheet_id)` | List all sheet tabs in a spreadsheet |

### Google Docs (2 tools)

| Tool | Description |
|------|-------------|
| `docs_read(document_id)` | Read the full content of a Google Doc |
| `docs_create(title, content?)` | Create a new Google Doc with optional initial content |

### Google Contacts (3 tools)

| Tool | Description |
|------|-------------|
| `google_contacts_list(max_results?)` | List Google Contacts |
| `google_contacts_search(query, max_results?)` | Search contacts by name, email, or phone |
| `google_contacts_create(name, email?, phone?, organization?)` | Create a new Google Contact |

### Google Calendar (4 tools)

| Tool | Description |
|------|-------------|
| `gcal_list_events(date?, max_results?)` | List calendar events. Date: "today", "tomorrow", "this week", or a specific date. **Visitor-safe** |
| `gcal_create_event(summary, start_time, end_time, description?, location?, attendees?)` | Create a calendar event |
| `gcal_update_event(event_id, summary?, start_time?, end_time?, description?, location?)` | Update an existing calendar event |
| `gcal_delete_event(event_id)` | Delete a calendar event |

### Google Places (3 tools)

| Tool | Description |
|------|-------------|
| `google_places_search(query, max_results?)` | Search for places (e.g. "restaurants near Dubai Marina") |
| `google_places_details(place_id)` | Get detailed info about a specific place by its Place ID |
| `google_places_nearby(latitude, longitude, radius?, type?, max_results?)` | Search for places near a coordinate |

### Auth (1 tool)

| Tool | Description |
|------|-------------|
| `google_auth_status` | Check Google OAuth connection status and which services are authorized |

---

## 🖥️ CLI Agents (`capabilities/cli/tools.ts`)

Delegate coding tasks to AI coding CLIs (Gemini, Claude, Codex). Gated behind `config.capabilities.cli.enabled`.

| Tool | Description |
|------|-------------|
| `cli_triage(request)` | **Always call before `cli_run`.** Evaluates if existing tools/skills already handle the request, or if new code is needed. Verdict: exists / skill / tool / reject |
| `cli_run(prompt, project_name?)` | Start a CLI coding session. Spawns an AI coding assistant with the given prompt in a sandboxed workspace directory. Returns a session ID |
| `cli_status(session_id, from_line?)` | Check session status and read output incrementally. Returns latest output lines and running state |
| `cli_stop(session_id)` | Stop a running CLI coding session |
| `cli_list_sessions()` | List all CLI sessions with status, provider, and project name |
| `cli_send_input(session_id, input)` | Send text input to a running session (e.g. to answer prompts) |
| `cli_test_module(module_name)` | Test a staged custom tool module. Validates file existence, import, ToolModule interface, and naming conventions |
| `cli_promote_module(module_name)` | Promote a tested module from `custom/staging/` to `custom/modules/` and hot-reload it. Tools become available immediately |
| `cli_list_modules()` | List all custom modules — staged (in-progress) and live (active) — with tool counts |
| `cli_delete_module(module_name, target?)` | Delete a custom module from staging, live, or both |

---

## ✅ Approvals (`automation/approvals/tools.ts`)

Owner approval flow for sensitive decisions. When a skill creates an approval, the owner is notified via WhatsApp and Telegram.

| Tool | Description |
|------|-------------|
| `ask_owner(question, context, requester_jid)` | Escalate a sensitive decision to the owner. Notifies via WhatsApp and Telegram. The requester is told you'll check. **Visitor-safe** |
| `respond_to_approval(approval_id?, response)` | Owner responds to a pending approval. Response is relayed to the original requester's session |
| `list_pending_approvals()` | List all pending approval requests waiting for a response. **Visitor-safe** |

---

## ⏰ Follow-Ups (`automation/followups/tools.ts`)

Conversation continuity tracking. Ensures no conversation is forgotten.

| Tool | Description |
|------|-------------|
| `schedule_followup(session_id, contact_id, channel, reason, context, time?, priority?, max_attempts?)` | Schedule a follow-up check for a conversation with unresolved items. Time uses natural language ("in 2 hours", "tomorrow at 9am"). Default: 1 hour |
| `list_followups(status?, contact_id?, channel?)` | List follow-ups filtered by status (pending/completed/cancelled/expired/all), contact, or channel |
| `complete_followup(followup_id, result)` | Mark a follow-up as resolved. Describe how it was resolved in `result` |
| `cancel_followup(followup_id, reason?)` | Cancel a pending follow-up that is no longer needed |
| `get_conversation_status(session_id)` | Check if a session has pending, overdue, or upcoming follow-ups. Use at the start of a conversation with a returning contact |

---

## 🔐 Vault (`agents/vault/tools.ts`)

Encrypted storage for secrets and sensitive documents. Owner-only.

| Tool | Description |
|------|-------------|
| `vault_store(label, value, category?, notes?)` | Store sensitive text securely. Categories: general, credentials, identity, finance, documents, keys, notes |
| `vault_store_document(label, file_path, category?, notes?)` | Store a file (image, PDF, document) securely. Encrypts and stores the file content |
| `vault_retrieve(label)` | Retrieve a stored item by label or ID. Returns decrypted value for text items, metadata for documents |
| `vault_list(category?, search?)` | List all vault items. Shows labels and categories but NOT the actual values |
| `vault_delete(label)` | Permanently delete an item from the vault. Cannot be undone |

---

## 🍎 Apple (`capabilities/apple/tools.ts`)

macOS/iOS integration via AppleScript. Requires macOS.

### Apple Calendar (3 tools)

| Tool | Description |
|------|-------------|
| `apple_cal_list_events(days_ahead?, calendar_name?, max_results?)` | List upcoming Apple Calendar events |
| `apple_cal_create_event(summary, start_time, end_time, calendar_name?, location?, notes?)` | Create a new Apple Calendar event |
| `apple_cal_delete_event(summary, date, calendar_name?)` | Delete an Apple Calendar event by title and date |

### Apple Contacts (2 tools)

| Tool | Description |
|------|-------------|
| `apple_contacts_list(max_results?)` | List Apple Contacts |
| `apple_contacts_search(query)` | Search Apple Contacts by name, email, or phone |

### Apple Notes (3 tools)

| Tool | Description |
|------|-------------|
| `apple_notes_list(folder?, max_results?)` | List notes in Apple Notes |
| `apple_notes_read(note_name)` | Read the content of a specific note by title |
| `apple_notes_create(title, body, folder?)` | Create a new note in Apple Notes |

### Apple Mail (3 tools)

| Tool | Description |
|------|-------------|
| `apple_mail_list(mailbox?, max_results?)` | List emails from Apple Mail |
| `apple_mail_read(subject, mailbox?)` | Read an email by subject from Apple Mail |
| `apple_mail_send(to, subject, body)` | Send an email via Apple Mail |

---

## 🛠️ Exec (`capabilities/cli/exec-tools.ts`)

Direct shell command execution. Owner-only. Security mode configured in `config.capabilities.exec`.

| Tool | Description |
|------|-------------|
| `exec(command, timeout?, background?, cwd?)` | Execute a shell command. Set `background: true` for long-running commands — returns a `session_id` immediately |
| `process(action, session_id?, lines?)` | Manage background exec sessions. Actions: `list` (all sessions), `poll` (new output delta), `log` (last N lines), `kill` (terminate) |

---

## 🩹 Patch (`capabilities/filesystem/patch-tools.ts`)

| Tool | Description |
|------|-------------|
| `apply_patch(path, patch)` | Apply a unified diff patch to a file. Uses standard `@@ -line,count +line,count @@` format. Returns hunks applied/rejected |

---

## 🖼️ Media (`capabilities/filesystem/media-tools.ts`)

Document and image processing. Same path security as the filesystem module.

| Tool | Description |
|------|-------------|
| `extract_pdf_text(path, max_pages?)` | Extract text content from a PDF file (up to 50MB, 100K chars) |
| `extract_document_text(path)` | Read and extract text from common formats: txt, md, csv, json, html, xml, log (up to 10MB) |
| `describe_image(path)` | Load an image file (png, jpg, gif, webp) and encode it for the LLM to visually analyze |

---

## 3. Visitor-Safe Tools (`VISITOR_SAFE_TOOL_NAMES`)

Non-owner sessions are restricted to these 11 tools only:

`ask_owner`, `search_messages`, `get_contacts`, `get_profile`, `get_conversations`, `save_memory`, `web_search`, `web_fetch`, `list_pending_approvals`, `gcal_list_events`, `wa_respond_to_bot`

---

## 4. MCP Tools (Dynamic)

MCP tools are configured per-instance and vary by deployment. When connected, they appear alongside native tools and are automatically deduplicated by `tool-router.ts`. Run `cli_triage` to see which tools are currently active.

---

## 5. Custom Modules (Dynamic)

The `cli_*` tools can build and hot-load new `ToolModule` packages into `custom/modules/`. Their tools appear in the owner's tool list immediately after promotion. Use `cli_list_modules()` to see active custom modules.
