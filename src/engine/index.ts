/**
 * Agent Module Index
 * Re-exports all agent components
 */

export { createAgentOrchestrator, type AgentOrchestrator } from './orchestrator.js';
export { createConversationStore, conversationMigrations, type ConversationStore } from '../memory/conversation.js';
export { createMemoryStore, memoryMigrations, type MemoryStore, type MemoryEntry, type MemoryCategory } from '../memory/memory-store.js';
export { createSoul, type Soul, BOT_SOUL_ID, OWNER_SOUL_ID } from '../memory/soul.js';
export { AGENT_TOOLS, formatToolsForPrompt, parseToolCalls, extractTextContent, createToolRegistry, type ToolRegistry, type ToolExecutor } from './tools.js';
export type {
  ChatMessage,
  ChatRole,
  ChatMessageMetadata,
  ConversationSession,
  ToolDefinition,
  ToolParameter,
  ToolCallResult,
  ToolExecutionResult,
  AgentConfig,
  AgentResponse,
} from './types.js';
export { DEFAULT_AGENT_CONFIG } from './types.js';
