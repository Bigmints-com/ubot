# Interaction Model

Ubot employs a conversation-driven model where the agent acts as an autonomous extension of the owner's intent.

## 1. Intent Mapping

Ubot resolves natural language into technical actions:

- **Direct Commands**: Explicit requests like "create a skill" map to the `SkillEngine`.
- **Implicit Delegation**: Requests like "summarize these files" trigger the `AgentOrchestrator` to chain filesystem and reasoning tools.

## 2. Owner-in-the-Loop

For high-stakes actions, Ubot uses the **Escalation Protocol**:

- **`ask_owner` Tool**: When an agent encounters an action requiring authorization (e.g., sharing private info), it executes the `ask_owner` tool to pause and request confirmation.
- **Interactive Responses**: The agent drafts its proposed response or action and presents it to the owner for final approval.

## 3. Multi-Agent Switching

- **Persona Context**: Switching agents (e.g., from 'General' to 'Dev') reloads the system prompt and restricts the toolset to only those modules defined in the persona's `.agent.md` file.
- **Session Continuity**: The conversation history persists across agent switches, allowing the new persona to maintain context from the previous interaction.
