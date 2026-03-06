# Data Interchange & Schemas

Standardized data structures used across Ubot for message normalization, tool calling, and event processing.

## 1. UnifiedMessage (Channel Normalization)

All channels (WhatsApp, Telegram, iMessage, web) normalize into this interface before processing:

```typescript
interface UnifiedMessage {
  channel: "whatsapp" | "telegram" | "imessage" | "web";
  senderId: string; // Channel-specific sender ID (JID, chatId, 'web-console')
  senderName: string; // Human-readable name
  senderUsername?: string; // Telegram username (without @)
  body: string; // Message text
  timestamp: Date;
  replyFn: (text: string) => Promise<void>; // Channel-specific reply function
  extra?: Record<string, unknown>; // Skill event extras (hasMedia, participant, interactiveOptions)
  attachments?: Attachment[]; // File attachments
}
```

## 2. SkillEvent (Skill Pipeline Input)

Events emitted to the EventBus for skill matching:

```typescript
interface SkillEvent {
  source: string; // 'whatsapp' | 'telegram' | 'web'
  type: string; // 'message'
  from: string; // Sender ID
  to: string; // 'bot'
  body: string; // Message text
  timestamp: Date;
  data: {
    senderName: string;
    senderUsername?: string;
    isOwner: boolean;
    rawJid?: string; // Original WhatsApp LID (for replying)
    participant?: string; // Group message actual sender
    hasMedia?: boolean;
    interactiveOptions?: WhatsAppInteractiveOption[]; // Bot menu options
  };
}
```

## 3. WhatsAppInteractiveOption (Bot Menu Parsing)

Structured options extracted from WhatsApp bot messages:

```typescript
interface WhatsAppInteractiveOption {
  type: string; // 'button' | 'list_item' | 'quick_reply' | 'url_button' | 'native_flow'
  id: string; // Button/row ID
  label: string; // Display text
  description?: string; // List item description
  section?: string; // List section title
  url?: string; // URL button destination
  flowName?: string; // Native flow name
  flowParams?: string; // Native flow parameters JSON
  cardIndex?: number; // Carousel card index
}
```

## 4. ToolCall (Agent Intent)

```typescript
interface ToolCallResult {
  toolName: string;
  arguments: Record<string, unknown>;
  rawText?: string;
}
```

## 5. ToolExecutionResult (Capability Feedback)

```typescript
interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
  duration: number; // Execution time in ms
}
```

## 6. Skill Definition

Skills have two storage formats depending on which backend created them.

### 6a. File-Based Format (SKILL.md YAML frontmatter)

Used by manually authored skills in `~/.ubot/skills/<skill-name>/SKILL.md`:

```yaml
name: string
description: string
triggers: string[]          # ['whatsapp:message', 'telegram:message', '*:*']
filter_dms_only: boolean
filter_groups_only: boolean
filter_contacts: string[]   # Phone numbers to restrict to
filter_groups: string[]     # Group JIDs to restrict to
condition: string           # LLM-checked condition text
outcome: 'reply' | 'silent' | 'send' | 'store'
enabled: boolean
```

The markdown body below the frontmatter is the processor instructions.

### 6b. Programmatic Skill Object (SQLite-backed)

Used by skills created via `create_skill` tool or web UI. The `Skill` interface:

```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: {
    events: string[];          // ['whatsapp:message'], ['*:*'], etc.
    condition?: string;        // LLM-checked condition text
    filters?: {
      contacts?: string[];     // Phone number allowlist
      groups?: string[];       // Group JID allowlist
      groupsOnly?: boolean;
      dmsOnly?: boolean;
      source?: string;         // Channel filter
      pattern?: string;        // Regex pre-filter on message body
    };
  };
  processor: {
    instructions: string;      // Natural language instructions for the LLM
    tools?: string[];          // Optional tool allowlist for this skill
    stages?: WorkflowStage[];  // Multi-stage pipeline (overrides instructions)
  };
  outcome: {
    action: 'reply' | 'send' | 'store' | 'silent';
    target?: string;           // For 'send': recipient phone/email
    channel?: string;          // For 'send': 'whatsapp' | 'telegram'
  };
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```
