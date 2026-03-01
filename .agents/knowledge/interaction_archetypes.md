# Interaction Archetypes

This document visualizes common interaction patterns in Ubot through sequence-like archetypes, demonstrating the orchestration between the owner, agents, and tools.

## 1. The Delegation Flow (Owner)

The standard use case where the owner delegates a complex task.

1.  **Owner**: "Find the marketing PDF from yesterday and summarize it."
2.  **Orchestrator**: Parses intent -> Matches `files` module.
3.  **Sandbox**: Validates request against workspace root ➜ `ALLOW`.
4.  **Tool (Filesystem)**: Executes `list_files` with date filter ➜ Returns `marketing_v2.pdf`.
5.  **Agent**: "I found the file. Analyzing..." -> Executes `browse_url(file://...)`.
6.  **Agent**: Returns concise bullet points to the Owner.

## 2. The Multi-Agent Handoff

Demonstrating dynamic persona switching.

1.  **Owner**: "I'm having a bug in this script. Switch to DevAgent."
2.  **Orchestrator**: Executes `switch_agent('dev')` ➜ Updates session state.
3.  **DevAgent**: "DevAgent active. What's the error?"
4.  **Owner**: [Pastes error]
5.  **DevAgent**: Analyzes ➜ Matches `shell` module.
6.  **Sandbox**: Validates against restricted dev whitelist ➜ `ALLOW`.
7.  **Tool (Shell)**: Runs `npm test` ➜ Reports failure.
8.  **DevAgent**: Proposes fix and offers to apply it.

## 3. The Escalation Sequence (Third Party)

How Ubot protects the owner's privacy and schedule.

1.  **Visitor**: "When can I meet with Pretheesh?"
2.  **Ubot (Soul)**: Identifies visitor ➜ Switches to `Visitor Safe` toolset.
3.  **Ubot**: Realizes meeting availability is sensitive ➜ Triggers `ask_owner`.
4.  **Ubot (Owner Channel)**: _"Someone is asking for a meeting. Should I share your Friday afternoon slots?"_
5.  **Owner**: "Yes, only Friday 2-4 PM."
6.  **Ubot (Visitor Channel)**: "He is available this Friday between 2 PM and 4 PM. Would you like to book a slot?"

## 4. The Proactive Pulse (Skill)

Automated interaction triggered by external events.

1.  **Trigger (Cron)**: Heartbeat fires at 5:00 PM.
2.  **SkillEngine**: Matches `Daily Recap` skill.
3.  **Processor**: Chains `web_search(top tech news)` + `files_read(todo.md)`.
4.  **Outcome**: Compiles a personalized briefing.
5.  **Messaging**: Sends the briefing to the Owner's primary channel.
