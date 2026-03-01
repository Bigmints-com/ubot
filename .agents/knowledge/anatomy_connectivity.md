# Anatomy Part 5: Connectivity (Channels & Messaging)

The "Interface" of Ubot. The Connectivity layer manages the bridge between Ubot and external messaging platforms.

## Core Components

- **Messaging Adapters**: Pluggable modules for WhatsApp (via Baileys), Telegram (via node-telegram-bot-api), and iMessage (via BlueBubbles REST API).
- **Provider Registry**: A central registry that maps channel names to their respective provider instances.
- **Standardized Event Flow**: Incoming raw messages are normalized into a common format (e.g., `SkillEvent`).

## Mechanics

1. **Connection Management**: Handles authentication, session persistence, and automatic reconnection for various protocols.
2. **Media Handling**: Specialized logic for processing images, audio (with STT support), and documents received via messaging channels.
3. **Outgoing Routing**: The orchestrator uses the registry to resolve the correct channel for sending replies, ensuring the interaction stays in the original thread.

## Multi-Channel Support

Ubot is designed to handle multiple accounts and platforms simultaneously. A single instance can listen on WhatsApp, Telegram, and iMessage, routing events to the same orchestrator brain while maintaining separate conversation stores for each platform.
