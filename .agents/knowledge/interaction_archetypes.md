# Interaction Archetypes

This document visualizes common interaction patterns in Ubot, demonstrating the orchestration between the owner, agents, skills, and tools.

## 1. The Delegation Flow (Owner)

The standard use case where the owner delegates a complex task.

1.  **Owner**: "Find the marketing PDF from yesterday and summarize it."
2.  **Orchestrator**: Parses intent → calls `search_files`.
3.  **Tool (Filesystem)**: Returns `marketing_v2.pdf`.
4.  **Agent**: Analyzes the file → Returns concise bullet points.

## 2. The Multi-Agent Handoff

Demonstrating dynamic persona switching.

1.  **Owner**: "I'm having a bug in this script. Switch to DevAgent."
2.  **Orchestrator**: Executes `switch_agent('dev')` → Updates session state.
3.  **DevAgent**: "DevAgent active. What's the error?"
4.  **Owner**: [Pastes error]
5.  **DevAgent**: Analyzes → Proposes fix.

## 3. The Escalation Sequence (Third Party)

How Ubot protects the owner's privacy.

1.  **Visitor**: "When can I meet with Pretheesh?"
2.  **Ubot (Handler)**: Owner detection → `isOwner: false` → Visitor toolset (11 tools).
3.  **Ubot**: Realizes meeting availability is sensitive → Triggers `ask_owner`.
4.  **Ubot (Owner Channel)**: _"Someone is asking for a meeting. Should I share your Friday afternoon slots?"_
5.  **Owner**: "Yes, only Friday 2-4 PM."
6.  **Ubot (Visitor Channel)**: "He is available this Friday between 2 PM and 4 PM."

## 4. The Bot Interaction Flow (Skill)

Autonomous interaction with a WhatsApp business bot.

1.  **Owner (Telegram)**: "Book an appointment with Dr. Vinod at Medcare on Monday at 10 AM."
2.  **Owner orchestrator**: Stores intent in `web-console` session.
3.  **Medcare bot (WhatsApp)**: Sends menu: "type A for booking, type M for manage..."
4.  **Handler**: `isOwner: false` → Emits `SkillEvent` to EventBus.
5.  **SkillEngine Phase 1**: DM Auto Reply ✓, WhatsApp Bot Interaction ✓ (both match DMs).
6.  **SkillEngine Phase 2**: LLM classifies → "automated bot" condition → Bot Interaction ✓, DM Reply ✗.
7.  **Bot Interaction Skill**: Injected owner context shows "book appointment with Dr. Vinod..."
8.  **Skill**: Matches "book" → option "A" → calls `wa_respond_to_bot(to=medcare_jid, response="A")`.
9.  **Medcare bot**: Presents sub-menu → Skill continues navigating autonomously.

## 5. The Proactive Pulse (Skill)

Automated interaction triggered by cron events.

1.  **Trigger (Cron)**: Heartbeat fires at 5:00 PM.
2.  **SkillEngine**: Matches `Daily Recap` skill.
3.  **Processor**: Chains `web_search(top tech news)` + `read_file(todo.md)`.
4.  **Outcome**: Compiles a personalized briefing → Sends to Owner's primary channel.

## 6. The Follow-Up Sequence

Ensuring conversation closure.

1.  **Visitor**: "Can I get a quote for x?"
2.  **Ubot (DM Skill)**: "I'll check with Pretheesh and get back to you." → Calls `ask_owner` + `schedule_follow_up(30 min)`.
3.  **Follow-Up Checker** (30 min later): Checks if the owner responded.
4.  **If no response**: Nudges the owner: "You haven't responded to X's request about a quote."
5.  **Owner responds**: Follow-up auto-completed.
