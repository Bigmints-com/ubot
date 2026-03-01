# Anatomy Part 4: The Skills (Workflow Composability)

The "Action" of Ubot. The Skill Engine enables complex, automated workflows that go beyond simple chat interactions.

## Core Components

- **`SkillEngine`**: Manages the processing of events through a multi-stage pipeline.
- **`Skill` Object**: Defined by a Trigger (when), a Processor (how), and an Outcome (what).
- **Workflow Pipeline**: A sequence of modular stages (`prompt`, `tool`, or `pipeline`).

## Mechanics

1. **Event Triggering**: Adapters (WhatsApp, Cron, etc.) emit `SkillEvent` objects.
2. **Two-Phase Matching**:
   - **Phase 1 (Filter)**: Fast regex and source checks (zero LLM cost).
   - **Phase 2 (Condition)**: An LLM check for nuanced intent matching.
3. **Pipeline Execution**: The engine iterates through defined stages, substituting variables (e.g., `{{event.body}}` or `{{stage_1.output}}`) into subsequent steps.

## Variable Substitution

Data is shared across the pipeline via a `pipelineContext`. Each stage can store its result in an `outputKey`, making it available to later stages. This allows for complex chaining: Search -> Summarize -> Save -> Reply.
