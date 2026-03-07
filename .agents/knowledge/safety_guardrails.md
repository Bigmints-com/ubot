# Safety & Ethical Guardrails

Beyond the technical filesystem sandbox, Ubot implements a multi-layered safety strategy to ensure responsible AI behavior.

## 1. Contextual Trust Levels

Ubot distinguishes between interactions based on the source of the message:

- **Owner Mode**: Full access to all tools (131+ including MCP). Detected via phone number (WhatsApp), Telegram ID/username, or web console.
- **Visitor Mode**: Restricted to 11 safe tools (`VISITOR_SAFE_TOOL_NAMES` in `engine/tools.ts`). The agent acts as a secretary, forbidden from sharing non-public data or executing privileged tools.

### Visitor-Safe Tools (11)

`ask_owner`, `search_messages`, `get_contacts`, `get_profile`, `get_conversations`, `save_memory`, `web_search`, `web_fetch`, `list_pending_approvals`, `gcal_list_events`, `wa_respond_to_bot`

## 2. Owner-in-the-Loop (Escalation)

When Ubot encounters a high-stakes request or an ambiguous situation:

- **`ask_owner(question, context?, requester_jid?)`**: Pauses processing and sends an approval request to the owner's primary channel (Telegram, WhatsApp, or web console).
- **Approval Store**: Pending approvals are stored in SQLite with IDs, context, and requester info. The owner can respond from any connected channel.
- **Relay System**: Approval requests are relayed to the owner across channels (e.g., WhatsApp visitor → Telegram notification to owner).

## 3. Anti-Hallucination Rules

The system prompt and skill context include strict behavioral rules:

- "NEVER claim you did something unless you actually called a tool and got a result in THIS conversation"
- "If you're unsure whether you completed an action, call the tool to verify"
- "COMPLETE every action in this turn. There is no 'later'"
- These rules are enforced in both owner and visitor skill contexts.

## 4. Skill Routing Safety

Skills use two-phase matching to prevent wrong-skill execution:

- **Phase 1**: Fast filters (source, contacts, groups) at zero LLM cost
- **Phase 2**: LLM condition check for nuanced intent matching
- Mutually exclusive conditions prevent two skills from firing for the same message (e.g., bot vs human DM routing)

## 5. Rate Limiting

WhatsApp outbound messages are rate-limited to prevent spam:

- Per-minute: 8 messages max
- Per-hour: 60 messages max
- Per-day: 500 messages max
- Human-like random delays (1-8 seconds)

## 6. Privacy & Data Protection

- **Local-First Memory**: All long-term memories stored locally in SQLite, never uploaded to cloud.
- **Session Isolation**: Each contact gets their own conversation session. Visitor conversations don't leak into the owner's session.
