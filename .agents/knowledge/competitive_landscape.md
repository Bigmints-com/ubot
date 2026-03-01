# Comparative Architecture: Why Ubot?

An architectural analysis of Ubot against other agent frameworks, focusing on technical differentiation.

## 1. Ubot vs. Library Frameworks (LangChain/CrewAI)

LangChain and CrewAI are primarily libraries for building agents. Ubot is a persistent **integrated runtime**.

- **State Persistence**: Ubot manages durable session state and memory via SQLite and Markdown files out-of-the-box. Library frameworks typically require external infrastructure for persistence.
- **Messaging-Native**: Ubot is architected as an event handler for messaging providers (WhatsApp/Telegram), normalizing incoming events into a standard `SkillEvent` format.

## 2. Ubot vs. Autonomous Agents (AutoGPT)

Autonomous agents like AutoGPT focus on recursive goal-solving but can lack operational control.

- **Guided Autonomy**: Ubot uses the **Skill Engine** (Trigger-Processor-Outcome) to provide predictable automation pipelines while allowing LLM reasoning within those stages.
- **Strict Sandboxing**: The **WorkspaceGuard** enforced at the runtime level provides stronger security than open-ended autonomous scripts.

## 3. Deployment Context

Ubot is optimized for **Edge Execution**:

- **Environment**: Unlike heavy cloud-native frameworks, Ubot is a Node.js process designed to run on low-resource hardware.
- **Connectivity**: Integrated adapters for WhatsApp and Telegram provide an immediate interface without requiring additional front-end development.

## 4. Technical Summary

| Feature      | Ubot                  | Generic Frameworks   |
| :----------- | :-------------------- | :------------------- |
| **Model**    | Integrated Runtime    | Library / SDK        |
| **Memory**   | Local-First (Durable) | Ephemeral / External |
| **I/O**      | Messaging-Native      | CLI / API            |
| **Security** | Runtime Sandbox       | Application-Level    |
| **Logic**    | Skills & Personas     | Chains / Agents      |
