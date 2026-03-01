# Anatomy Part 1: The Soul (Identity Layer)

The "Who" of Ubot. The Soul layer defines the agent's personality, values, and memory.

## Core Components

- **`Soul` Module**: The primary controller for the identity layer. It manages the lifecycle of the agent's personality.
- **`IDENTITY.md`**: A human-readable file defining the bot's name, role, background, and behavioral constraints.
- **`SOUL.md`**: A definition of the owner's details, preferences, and relationship with the bot.

## Mechanics

1. **Sync to Filesystem**: On startup, the `Soul` layer exports database-backed records to the workspace as Markdown.
2. **Dynamic Preamble Building**: When a message arrives, the Orchestrator requests a "preamble" from the Soul. This combines the bot's identity, owner info, and relevant contact facts into a cohesive system prompt.
3. **Fact Management**: Memories and contact details are stored as atomic facts, retrieved based on relevance to the current conversation.

## Filesystem Integration

The Soul layer uses a file watcher to listen for changes to the Markdown files. This allows for manual "hot-tuning" of the agent's personality without code restarts.
