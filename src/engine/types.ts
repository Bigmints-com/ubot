/**
 * Agent Types
 * Core types for the Ubot AI agent system
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  timestamp: Date;
  metadata?: ChatMessageMetadata;
}

export interface ChatMessageMetadata {
  /** Source of the message: web UI or WhatsApp JID */
  source?: 'web' | 'whatsapp' | 'telegram';
  /** WhatsApp JID if source is whatsapp */
  whatsappJid?: string;
  /** Contact name if known */
  contactName?: string;
  /** Tool call info if this message contains a tool call */
  toolCall?: ToolCallResult;
  /** Tool result if this message is a tool response */
  toolResult?: ToolExecutionResult;
  /** Token usage for assistant messages */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** LLM model used */
  model?: string;
  /** File attachments (images, documents) */
  attachments?: Attachment[];
}

export interface ConversationSession {
  id: string;
  /** 'web-console' for UI, WhatsApp JID for WhatsApp chats */
  type: 'web' | 'whatsapp' | 'telegram';
  /** Display name for the session */
  name: string;
  createdAt: Date;
  updatedAt: Date;
  /** Number of messages in this session */
  messageCount: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
}

export interface ToolCallResult {
  toolName: string;
  arguments: Record<string, unknown>;
  /** Raw text from LLM that triggered the tool call */
  rawText?: string;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
  duration: number;
}

/** File attachment (image, PDF, document) flowing through the message pipeline */
export interface Attachment {
  /** Unique ID for this attachment */
  id: string;
  /** Original filename */
  filename: string;
  /** MIME type (e.g. image/png, application/pdf) */
  mimeType: string;
  /** Absolute path on disk (workspace/uploads/) */
  path: string;
  /** Base64-encoded content (for images sent to LLM) */
  base64?: string;
  /** Extracted text content (for PDFs/documents) */
  textContent?: string;
  /** File size in bytes */
  size?: number;
}

export interface LLMProviderConfig {
  /** Unique identifier */
  id: string;
  /** Display name, e.g. "Gemini Flash" */
  name: string;
  /** Provider type */
  provider: 'openai' | 'gemini' | 'ollama' | 'custom';
  /** API base URL */
  baseUrl: string;
  /** API key (empty for Ollama) */
  apiKey: string;
  /** Model name */
  model: string;
  /** Whether this is the default provider */
  isDefault: boolean;
}

export interface AgentConfig {
  /** Ollama / OpenAI API base URL (derived from active provider) */
  llmBaseUrl: string;
  /** Model name (derived from active provider) */
  llmModel: string;
  /** API key (derived from active provider) */
  llmApiKey: string;
  /** Configured LLM providers */
  llmProviders: LLMProviderConfig[];
  /** ID of the active/default LLM provider */
  defaultLlmProviderId: string;
  /** Owner's name — used to identify the owner in conversations */
  ownerName: string;
  /** Owner's phone number (e.g. +971569737344) — used to route approval requests */
  ownerPhone: string;
  /** System prompt for the agent */
  systemPrompt: string;
  /** Max messages to include in context */
  maxHistoryMessages: number;
  /** Max tool call iterations per turn */
  maxToolIterations: number;
  /** Temperature for LLM */
  temperature: number;
  /** Max tokens for LLM response */
  maxTokens: number;
  /** Owner's Telegram Chat ID — used to route approval requests */
  ownerTelegramId: string;
  /** Owner's Telegram username (without @) — used for owner detection */
  ownerTelegramUsername: string;
  /** Whether to auto-reply to WhatsApp messages */
  autoReplyWhatsApp: boolean;
  /** Whether to auto-reply to Telegram messages from non-owner contacts */
  autoReplyTelegram: boolean;
  /** Contacts to auto-reply to (empty = all) */
  autoReplyContacts: string[];
  /** Group reply policy: false = never, 'mentions_only' = only when @mentioned, true = always */
  autoReplyGroups: boolean | 'mentions_only';
  /** Bot name for mention detection in groups (e.g. 'ubot') */
  botName: string;
}

export interface AgentResponse {
  /** Final text response */
  content: string;
  /** Any tool calls that were made */
  toolCalls: ToolExecutionResult[];
  /** Token usage */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** Model used */
  model: string;
  /** Processing duration in ms */
  duration: number;
  /** Attachments that were part of this interaction */
  attachments?: Attachment[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string;
  allowedTools?: string[]; // Empty means all tools
  model?: string;
  temperature?: number;
}

const DEFAULT_LLM_PROVIDER_ID = 'default-gemini';

const DEFAULT_LLM_PROVIDER: LLMProviderConfig = {
  id: DEFAULT_LLM_PROVIDER_ID,
  name: 'Gemini Flash',
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: '',
  model: 'gemini-2.0-flash',
  isDefault: true,
};

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  llmBaseUrl: DEFAULT_LLM_PROVIDER.baseUrl,
  llmModel: DEFAULT_LLM_PROVIDER.model,
  llmApiKey: DEFAULT_LLM_PROVIDER.apiKey,
  llmProviders: [DEFAULT_LLM_PROVIDER],
  defaultLlmProviderId: DEFAULT_LLM_PROVIDER_ID,
  ownerName: '',
  ownerPhone: '',
  systemPrompt: `You are Ubot, a personal AI assistant. You help users automate tasks through WhatsApp and other messaging platforms.

You have access to messaging and automation tools. Use them when the user asks you to perform actions like sending messages, searching conversations, or managing contacts.

## Skills (Universal Automations)
Skills are automated pipelines: **Trigger → Processor → Outcome**
- **Trigger**: What event activates the skill (e.g. whatsapp:message, email:received, cron:tick). Can include fast filters (contacts, groups, patterns) and/or a natural language condition checked by LLM.
- **Processor**: Natural language instructions for the LLM. What to do when triggered.
- **Outcome**: What happens with the result — reply (back to sender), send (to someone else), store (save to memory), silent (already handled via tools).

When the user asks to set up ANY automation:
1. Use create_skill immediately with clear instructions. Don't ask unnecessary follow-up questions.
2. Choose the right events (default: whatsapp:message).
3. Use "condition" for intent-based matching (e.g. "when someone asks about my schedule").
4. Use "contacts" or "groups" for fast filtering by sender.
5. Choose the right outcome (reply, send, store, or silent).

Use list_skills to find existing skill IDs before updating or deleting.
Be proactive: if the user describes what they want, create the skill right away with sensible defaults.

## Browser Capability
You can control a real browser using browse_url, browser_click, browser_type, browser_read_page, and browser_screenshot tools.
- The browser launches automatically on first use (no setup needed).
- Use browse_url to visit ANY website — Gmail, Google Calendar, news sites, dashboards, etc.
- For Gmail: browse to https://mail.google.com, read emails, compose replies.
- For Calendar: browse to https://calendar.google.com, read events, create new ones.
- If a page requires login, navigate there and let the user log in (browser is visible).
- Always use browse_url FIRST, then browser_read_page to get content, then browser_click/browser_type to interact.
- When the user asks to "check my email", "what's on my calendar", or anything web-related — USE THE BROWSER TOOLS immediately.

## CLI & Custom Capabilities
You can extend yourself with new tools. If you realize you can't handle a request, the system will automatically triage it to check if existing tools can help or if a new tool should be built.

When triage runs (automatically or via cli_triage), act on the verdict:
- **EXISTS** → Use the listed tools directly. Do NOT build anything new.
- **SKILL** → Compose existing tools into an automated pipeline via create_skill with stages.
- **TOOL** → Build it: cli_run → cli_test_module → cli_promote_module. The new tool becomes available immediately.
- **REJECT** → Explain why it's not possible and suggest alternatives.

You can also call cli_triage proactively if a user explicitly asks to "add" or "build" a capability.
Use cli_delete_module to clean up failed or unwanted custom modules.

{{tools}}

Rules:
- Use tools when the user's request requires an action
- Be concise and helpful
- If a tool fails, explain the error and suggest alternatives
- If you don't know something, say so honestly
- When sending messages, confirm unless the user explicitly asked you to send it or it's an automated skill execution

## Owner Approval (ask_owner)
You are the owner's personal secretary. Handle most conversations autonomously, but for sensitive requests you MUST use the ask_owner tool.

### Do NOT use ask_owner for:
- General questions about the owner (name, what they do, interests) — answer from persona
- Greetings, small talk, or casual conversation — handle yourself
- Questions you CAN answer from your persona/soul documents
- The owner talking to you directly

### You MUST call ask_owner when:
- A third party asks for sensitive/private info not in your persona (phone numbers, bank details, addresses)
- Someone requests a financial commitment (lending money, payments)
- Someone wants to schedule/commit on the owner's behalf
- Any request where getting it wrong could cause real harm

**IMPORTANT**: When escalating, you MUST call the ask_owner tool function. Do NOT just say "I'll check with the owner" without actually calling the tool. The tool creates the approval request that the owner can respond to.`,
  maxHistoryMessages: 50,
  maxToolIterations: 6,
  temperature: 0.7,
  maxTokens: 2048,
  ownerTelegramId: '',
  ownerTelegramUsername: '',
  autoReplyWhatsApp: false,
  autoReplyTelegram: false,
  autoReplyContacts: [],
  autoReplyGroups: false,
  botName: 'ubot',
};
