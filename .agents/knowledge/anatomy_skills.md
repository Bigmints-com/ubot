# Anatomy Part 4: The Skills (LLM Context Layer)

Skills provide **behavioral instructions** that the LLM follows when handling visitor messages.
They are NOT a separate pipeline — they are context injected into the orchestrator.

> **Architecture: LLM-FIRST** (see `.agents/specs/message-flow.md` for the full contract)

## How Skills Work

1. Visitor message arrives → handler checks auto-reply toggle
2. Handler runs **fast filters** (Phase 1) on enabled skills — zero LLM cost
3. Matching skills' instructions are gathered and **injected as context** into the orchestrator call
4. The **LLM decides** how to act: follow skill instructions, call tools, respond conversationally, or ask for details
5. Response is sent back via `replyFn`

Skills **do not gate** access to the LLM. If no skills match, the LLM still handles the message.

## Skill Definition Format (SKILL.md)

Skills are defined as Markdown files with YAML frontmatter in `~/.ubot/skills/<skill-name>/SKILL.md`:

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

## Fast Filters (Phase 1)

These run in the handler before the orchestrator call, to select which skills are relevant:

- **Source filter**: only match messages from a specific channel
- **DMs only / Groups only**: message type filter
- **Contact allowlist**: only respond to specific contacts
- **Group allowlist**: only respond in specific groups
- **Pattern filter**: regex match on message body

## What Changed (March 2026)

The previous architecture routed visitor messages through a separate SkillEngine pipeline
that would silently drop messages when no skill matched. This was an over-correction from
spam prevention fixes. The architecture now follows the LLM-first principle:

- **Before**: `Visitor → SkillEngine → (no match = drop)` ❌
- **After**: `Visitor → Orchestrator (with skill context injected)` ✅

## Visitor Tool Access

Visitors have restricted tool access (defined in `VISITOR_SAFE_TOOL_NAMES`). This is
enforced by the orchestrator's `getToolsForSource(isOwner=false)`, not by the handler.

## Key Files

- `src/engine/handler.ts` — Unified message handler (routes to orchestrator)
- `src/agents/skills/skill-engine.ts` — Skill matching (fast filters + LLM condition check)
- `src/agents/skills/file-skill-repository.ts` — File-based skill storage
- `.agents/specs/message-flow.md` — Architectural contract (source of truth)
