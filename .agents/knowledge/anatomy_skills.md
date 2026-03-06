# Anatomy Part 4: The Skills (Workflow Composability)

The "Action" of Ubot. The Skill Engine enables complex, automated workflows that go beyond simple chat interactions.

## Core Components

- **`SkillEngine`**: Manages the processing of events through a multi-stage pipeline.
- **`Skill` Object**: Defined by a Trigger (when), a Processor (how), and an Outcome (what).
- **`SkillRepository`**: Interface for skill persistence. Two backends exist:
  - **`file-skill-repository.ts`** — Stores each skill as `~/.ubot/skills/<skill-name>/SKILL.md`. Used for manually authored skills; git-trackable and human-editable.
  - **`skill-repository.ts`** — SQLite-backed persistence. Used for skills created via the web UI or the `create_skill` / `update_skill` tools.
  - The `SkillEngine` accepts either backend through the same `SkillRepository` interface.

## Skill Definition Format (SKILL.md)

Skills are defined as Markdown files with YAML frontmatter:

```yaml
---
name: Skill Name
description: What this skill does
triggers: [message]
filter_dms_only: true
condition: LLM-checked condition for Phase 2
outcome: reply | silent
enabled: true
---
# Instructions for the LLM
```

## Two-Phase Matching

1. **Phase 1 (Filter)**: Fast checks — source, DMs-only, groups-only, contact/group allowlists, regex patterns. Zero LLM cost.
2. **Phase 2 (Condition)**: LLM classifies event against the skill's `condition` text. One cheap yes/no call. Skills without conditions auto-match if Phase 1 passes.

## Owner Context Injection

When a skill executes, the engine reads the **owner's last 5 messages** from the `web-console` session (via `ConversationStore`) and injects them into the skill context. This allows skills to understand the owner's intent without calling `ask_owner`. Example: owner says "book an appointment" via Telegram → bot interaction skill sees that context → selects menu option "A" without asking.

## Pipeline Execution

### Legacy Single-Processor

Most skills use the legacy path: the LLM receives skill instructions + event body + owner context as a `skillContext` string, and processes the message using `agentChat()` with the visitor's session and tools.

### Stage-Based Pipeline

Advanced skills chain multiple stages:

1. **Stage 1 (prompt/tool)**: Gather data or transform input.
2. **Stage 2 (prompt/tool)**: LLM processing of stage 1 output.
3. **Stage 3 (tool)**: Execute action based on analysis.

Data flows between stages via `pipelineContext` and `outputKey` variables (`{{stage_name.output}}`).

## Visitor Tool Access

Skills run with visitor-level tool access (11 tools from `VISITOR_SAFE_TOOL_NAMES`). The `wa_respond_to_bot` tool was added to this allowlist to enable the bot interaction skill to send replies to WhatsApp bots.
