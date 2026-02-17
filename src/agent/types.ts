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
  source?: 'web' | 'whatsapp';
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
}

export interface ConversationSession {
  id: string;
  /** 'web-console' for UI, WhatsApp JID for WhatsApp chats */
  type: 'web' | 'whatsapp';
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

export interface AgentConfig {
  /** Ollama / OpenAI API base URL */
  llmBaseUrl: string;
  /** Model name */
  llmModel: string;
  /** API key (use 'ollama' for local Ollama) */
  llmApiKey: string;
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
  /** Whether to auto-reply to WhatsApp messages */
  autoReplyWhatsApp: boolean;
  /** Contacts to auto-reply to (empty = all) */
  autoReplyContacts: string[];
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
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  llmBaseUrl: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
  llmModel: process.env.LLM_MODEL || 'gemini-2.0-flash',
  llmApiKey: process.env.LLM_API_KEY || process.env.GOOGLE_API_KEY || '',
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

{{tools}}

Rules:
- Use tools when the user's request requires an action
- Be concise and helpful
- If a tool fails, explain the error and suggest alternatives
- If you don't know something, say so honestly
- When sending messages, confirm unless the user explicitly asked you to send it or it's an automated skill execution`,
  maxHistoryMessages: 20,
  maxToolIterations: 3,
  temperature: 0.7,
  maxTokens: 2048,
  autoReplyWhatsApp: false,
  autoReplyContacts: [],
};
