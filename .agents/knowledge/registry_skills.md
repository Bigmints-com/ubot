# Registry: Skills & Automations

A catalog of automated workflows that allow Ubot to react to events without manual prompts.

## 1. Architecture

Skills are **file-based** — each skill is a `SKILL.md` file in `~/.ubot/skills/<skill-name>/`. Skills follow the **Trigger → Processor → Outcome** pipeline and are loaded dynamically at startup (no DB migration needed).

### SKILL.md Format

```yaml
---
name: Skill Name
description: What this skill does
triggers: [message]
filter_dms_only: true # Only DMs, no groups
filter_groups_only: false # Only groups
filter_contacts: [] # Restrict to specific contacts
filter_groups: [] # Restrict to specific groups
condition: LLM-checked condition text # Phase 2 intent check
outcome: reply | silent # reply = send response back, silent = no auto-reply
enabled: true
---
# Instructions

Markdown instructions for the LLM when this skill fires.
```

## 2. Two-Phase Matching

- **Phase 1 (Fast Filter)**: Source, DMs-only, groups-only, contact/group lists, regex patterns. Zero LLM cost.
- **Phase 2 (LLM Condition)**: If `condition` is set, an LLM classifies the event as "yes/no" match. One cheap classification call. Skills without conditions auto-match if Phase 1 passes.

## 3. Owner Context Injection

When a skill executes, the engine injects the **owner's last 5 commands** from the `web-console` session into the skill's context. This allows skills to understand the owner's intent without calling `ask_owner`. For example, if the owner said "book an appointment" via Telegram, the bot interaction skill can see that intent and act accordingly.

## 4. Current Skills

### 🤖 WhatsApp Bot Interaction

- **Trigger**: `message` (DMs only)
- **Condition**: "message is from an automated WhatsApp bot or service"
- **Outcome**: `silent`
- **Tools used**: `wa_respond_to_bot`, `search_messages`, `ask_owner`
- **Purpose**: Navigate WhatsApp bot menus (letter-based, number-based, keyword, interactive buttons). Reads owner's intent from context, sends the exact menu key the bot expects. Auto-sends "Hi" for session restarts.

### 💬 DM Auto Reply

- **Trigger**: `message` (DMs only)
- **Condition**: "message is from a real human person — NOT from an automated bot"
- **Outcome**: `reply`
- **Purpose**: Reply to personal WhatsApp DMs as the owner's secretary.

### 👥 WhatsApp Group Contacts

- **Trigger**: `message` (groups only)
- **Outcome**: `reply`
- **Purpose**: Handle group-related contact queries.

### 📢 WhatsApp Group Mentions

- **Trigger**: `message` (groups only)
- **Outcome**: `reply`
- **Purpose**: Respond when mentioned in group conversations.

## 5. Skill Routing (Mutual Exclusion)

Skills can be made mutually exclusive using conditions. For example, `DM Auto Reply` and `WhatsApp Bot Interaction` both match DMs, but their LLM conditions ensure only one fires:

- Bot message → Bot Interaction skill (condition: "automated bot") ✓ / DM Reply (condition: "real human") ✗
- Human message → Bot Interaction skill ✗ / DM Reply ✓

## 6. Advanced Workflow Pipelines

Skills support multi-stage workflows via `stages` in the YAML frontmatter. A single skill can chain multiple processors:

1. **Stage 1 (Search)**: Gather raw data via tool call.
2. **Stage 2 (Analyze)**: LLM processing of the raw data.
3. **Stage 3 (Execute)**: Tool call based on the analysis.
4. **Stage 4 (Notify)**: Final confirmation to the user.

Variables pass between stages via `{{stage_name.output}}` substitution.
