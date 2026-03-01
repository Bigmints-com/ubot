# Safety & Ethical Guardrails

Beyond the technical filesystem sandbox, Ubot implements a multi-layered safety strategy to ensure responsible AI behavior.

## 1. Contextual Trust Levels

Ubot distinguishes between interactions based on the source of the message:

- **Owner Mode**: Full access to all tools (files, system exec, private messaging).
- **Contact Mode**: Restrictive access based on the contact's relationship (e.g., family vs. colleague).
- **Visitor Mode**: Strict "secretary" mode. The agent acts as a representative of the owner but is forbidden from sharing non-public data or executing most tools.

## 2. Owner-in-the-Loop (Escalation)

When Ubot encounters a high-stakes request or an ambiguous situation, it uses the **Escalation Protocol**:

- **`ask_owner`**: A built-in tool that allows the agent to pause processing and request manual confirmation or input from the owner via their primary messaging channel.
- **Approval Tokens**: For sensitive tools (like `delete_file`), Ubot can be configured to require a one-time numeric token sent as a second-factor confirmation.

## 3. Behavioral Guardrails

Personas are constrained by fixed system instructions that prioritize safe operation:

- **Instructional Anchors**: Every agent prompt includes core non-negotiables (e.g., "Do not reveal private keys," "Do not hallucinate availability").
- **Verification Loop**: Agents are often instructed to double-check tool outputs (like calendar times) against the source of truth before replying.

## 4. Privacy & Data Protection

- **Local-First Memory**: All long-term memories are stored locally in the workspace, never uploaded to a global Ubot cloud.
- **Redaction Logic**: A pre-processing layer can be configured to scrub PII (Personally Identifiable Information) before sending prompts to external LLM providers.
