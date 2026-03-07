---
description: Architectural spec for UBOT's visitor message flow. LLM-first, skill-aware. This is the source of truth — do NOT change the approach without updating this spec.
---

# Message Flow Architecture (Source of Truth)

> **⚠️ DO NOT change the visitor message routing approach without updating this spec first.**
> This document exists because the architecture has regressed multiple times due to bugfixes
> that over-corrected. Every change to `handler.ts` must be validated against this contract.

## Core Principle: LLM-First

The LLM (orchestrator) is the brain. It receives ALL valid messages — owner AND visitor —
and decides what to do: respond conversationally, call tools, execute a skill, or ask for
more details. The LLM is the router, not a separate skill engine.

## Message Flow

```
Message arrives
    │
    ▼
┌─────────────────────────────┐
│  INPUT FILTERING (pre-LLM)  │  ← Spam prevention. NO LLM cost.
│  - Skip self-messages       │
│  - Skip status@broadcast    │
│  - Skip empty bodies        │
│  - Check auto-reply toggle  │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│     OWNER DETECTION         │  ← Is this the owner or a visitor?
│  - Web = always owner       │
│  - WA: match by phone       │
│  - TG: match by ID/username │
└─────────────┬───────────────┘
              │
              ▼
┌──────────────────────────────────┐
│     ORCHESTRATOR (LLM)           │  ← The brain. Handles EVERYTHING.
│                                  │
│  Owner messages:                 │
│   - Full tool access             │
│   - All MCP tools                │
│                                  │
│  Visitor messages:               │
│   - Visitor-safe tools only      │
│   - Skill instructions injected  │
│     into system prompt           │
│   - Persona/soul context loaded  │
│                                  │
│  The LLM decides:               │
│   ✓ Respond conversationally     │
│   ✓ Call a tool                  │
│   ✓ Ask for more details         │
│   ✓ Follow skill instructions    │
│   ✓ Escalate to owner            │
└──────────────────────────────────┘
```

## What Skills Are (and Are NOT)

### Skills ARE:

- **Instructions/context** injected into the system prompt for specific scenarios
- **Behavioral guidelines** (e.g., "when someone asks about pricing, explain our packages")
- **Workflow definitions** that the LLM follows when the situation matches

### Skills are NOT:

- A separate pipeline that gates access to the LLM
- A pre-filter that silently drops messages
- A replacement for the orchestrator

### How skills work in the LLM-first model:

1. When a visitor message arrives, gather all enabled skills
2. Inject their names + descriptions into the system prompt as "available capabilities"
3. The LLM reads the message, sees the skills, and decides which (if any) to follow
4. If a skill matches, the LLM follows its instructions (which may include tool calls)
5. If no skill matches, the LLM responds conversationally or asks for details

## Spam Prevention (Input Layer, NOT LLM Layer)

These filters run BEFORE the orchestrator. They are cheap and prevent abuse:

1. **Self-messages**: `isFromMe === true` → skip
2. **Status broadcasts**: `status@broadcast` → skip
3. **Empty body**: no text content → skip
4. **Auto-reply toggle OFF**: `config.autoReplyTelegram === false` → skip
5. **Rate limiting**: if same sender sent >N messages in M seconds → skip

These are the ONLY things that should prevent a response. Everything else is the LLM's job.

## Visitor Security Policy

Visitors have restricted tool access (defined in `VISITOR_SAFE_TOOL_NAMES`). This is
enforced by the orchestrator's `getToolsForSource(isOwner=false)`, NOT by the handler.

## Anti-Regression Checklist

Before any change to `handler.ts`, verify:

- [ ] Visitor messages reach the orchestrator (not just the skill engine)
- [ ] A simple "hi" from a visitor gets a conversational response
- [ ] Skills are injected as context, not as a gating pipeline
- [ ] Spam prevention is done via input filtering, not by removing LLM access
- [ ] The auto-reply toggle still works (OFF = no response at all)
- [ ] Owner messages still go through the orchestrator with full tool access
