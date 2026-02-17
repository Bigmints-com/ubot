/**
 * Agent Tools
 * Platform-agnostic tool definitions for the agent.
 * These tools work with any messaging provider (WhatsApp, Telegram, iMessage).
 */

import type { ToolDefinition, ToolCallResult, ToolExecutionResult } from './types.js';

/** All available tool definitions for prompt injection */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'send_message',
    description: 'Send a message to a contact or group on any connected messaging platform',
    parameters: [
      { name: 'to', type: 'string', description: 'Phone number with country code (e.g. +971501234567) or contact/group ID', required: true },
      { name: 'body', type: 'string', description: 'The message text to send', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel (whatsapp, telegram, imessage). Defaults to the connected one.', required: false },
    ],
  },
  {
    name: 'search_messages',
    description: 'Search through message history across all connected platforms',
    parameters: [
      { name: 'from', type: 'string', description: 'Filter by sender phone number or ID', required: false },
      { name: 'to', type: 'string', description: 'Filter by recipient phone number or ID', required: false },
      { name: 'query', type: 'string', description: 'Text to search for in message body', required: false },
      { name: 'limit', type: 'number', description: 'Max results to return (default 20)', required: false },
      { name: 'channel', type: 'string', description: 'Filter by messaging channel', required: false },
    ],
  },
  {
    name: 'get_contacts',
    description: 'List contacts from connected messaging platforms. Can search by name or number.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search by name, phone number, or ID', required: false },
      { name: 'channel', type: 'string', description: 'Filter by messaging channel', required: false },
    ],
  },
  {
    name: 'get_conversations',
    description: 'List recent conversations across all connected platforms',
    parameters: [
      { name: 'limit', type: 'number', description: 'Max conversations to return (default 20)', required: false },
      { name: 'channel', type: 'string', description: 'Filter by messaging channel', required: false },
    ],
  },
  {
    name: 'delete_message',
    description: 'Delete a specific message by its ID',
    parameters: [
      { name: 'messageId', type: 'string', description: 'The ID of the message to delete', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel the message is on', required: false },
    ],
  },
  {
    name: 'reply_to_message',
    description: 'Reply to a specific message by its ID (quotes the original message)',
    parameters: [
      { name: 'messageId', type: 'string', description: 'The ID of the message to reply to', required: true },
      { name: 'body', type: 'string', description: 'The reply text', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel', required: false },
    ],
  },
  {
    name: 'get_connection_status',
    description: 'Get the connection status of messaging platforms',
    parameters: [
      { name: 'channel', type: 'string', description: 'Specific channel to check, or omit for all', required: false },
    ],
  },
  {
    name: 'schedule_message',
    description: 'Schedule a message to be sent at a specific time',
    parameters: [
      { name: 'to', type: 'string', description: 'Phone number with country code', required: true },
      { name: 'body', type: 'string', description: 'The message text to send', required: true },
      { name: 'time', type: 'string', description: 'When to send, e.g. "in 30 minutes", "tomorrow at 9am", or ISO date string', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel', required: false },
    ],
  },
  {
    name: 'set_auto_reply',
    description: 'Set up automatic replies for specific contacts. When a message comes from these contacts, the agent will auto-reply.',
    parameters: [
      { name: 'contacts', type: 'string', description: 'Comma-separated phone numbers to monitor, or "all" for all contacts', required: true },
      { name: 'instructions', type: 'string', description: 'Instructions for how to reply', required: true },
      { name: 'enabled', type: 'boolean', description: 'true to enable, false to disable', required: true },
    ],
  },
  {
    name: 'web_search',
    description: 'Search the web for information',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
    ],
  },
  {
    name: 'list_skills',
    description: 'List all skills (automated pipelines). Each skill has a Trigger → Processor → Outcome pipeline.',
    parameters: [],
  },
  {
    name: 'create_skill',
    description: 'Create a new skill (automated pipeline). Each skill has: TRIGGER (what event activates it), PROCESSOR (instructions for the LLM), OUTCOME (what to do with the result).',
    parameters: [
      { name: 'name', type: 'string', description: 'Skill name', required: true },
      { name: 'description', type: 'string', description: 'What the skill does', required: true },
      { name: 'instructions', type: 'string', description: 'Natural language instructions for the LLM processor. Example: "Reply casually on my behalf. If you don\'t know the answer, say I\'ll call back."', required: true },
      { name: 'events', type: 'string', description: 'Comma-separated event types to trigger on. e.g. "whatsapp:message", "email:received", "cron:tick". Default: "whatsapp:message"', required: false },
      { name: 'condition', type: 'string', description: 'Natural language condition checked by LLM. e.g. "when someone asks about my schedule". If omitted, triggers on all matching events.', required: false },
      { name: 'contacts', type: 'string', description: 'Comma-separated contact numbers to filter (fast filter, no LLM cost)', required: false },
      { name: 'groups', type: 'string', description: 'Comma-separated group JIDs to filter', required: false },
      { name: 'groups_only', type: 'boolean', description: 'If true, only trigger in groups', required: false },
      { name: 'pattern', type: 'string', description: 'Regex pattern for fast pre-match on message body', required: false },
      { name: 'outcome', type: 'string', description: 'What to do with the result: "reply" (back to sender), "send" (to target), "store" (save), "silent" (tools already handled it). Default: "reply"', required: false },
      { name: 'outcome_target', type: 'string', description: 'For outcome "send": target recipient phone/email', required: false },
      { name: 'enabled', type: 'boolean', description: 'Whether the skill is active (default: true)', required: false },
    ],
  },
  {
    name: 'update_skill',
    description: 'Update an existing skill. Can change trigger, processor instructions, outcome, or filters.',
    parameters: [
      { name: 'skill_id', type: 'string', description: 'ID of the skill to update', required: true },
      { name: 'name', type: 'string', description: 'New name', required: false },
      { name: 'description', type: 'string', description: 'New description', required: false },
      { name: 'instructions', type: 'string', description: 'New processor instructions', required: false },
      { name: 'events', type: 'string', description: 'New event types (comma-separated)', required: false },
      { name: 'condition', type: 'string', description: 'New trigger condition (natural language)', required: false },
      { name: 'contacts', type: 'string', description: 'New contact filter (comma-separated)', required: false },
      { name: 'groups', type: 'string', description: 'New group filter (comma-separated)', required: false },
      { name: 'groups_only', type: 'boolean', description: 'Only trigger in groups', required: false },
      { name: 'pattern', type: 'string', description: 'New regex pattern', required: false },
      { name: 'outcome', type: 'string', description: 'New outcome: "reply", "send", "store", "silent"', required: false },
      { name: 'outcome_target', type: 'string', description: 'New target for "send" outcome', required: false },
      { name: 'enabled', type: 'boolean', description: 'Enable or disable', required: false },
    ],
  },
  {
    name: 'delete_skill',
    description: 'Delete a skill by its ID.',
    parameters: [
      { name: 'skill_id', type: 'string', description: 'ID of the skill to delete', required: true },
    ],
  },
];

/** Format tools for the system prompt (text-based fallback) */
export function formatToolsForPrompt(tools: ToolDefinition[]): string {
  return tools.map(tool => {
    const params = tool.parameters.length > 0
      ? tool.parameters.map(p => 
          `  - ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${p.description}`
        ).join('\n')
      : '  (no parameters)';
    return `- ${tool.name}: ${tool.description}\n${params}`;
  }).join('\n\n');
}

/** Convert ToolDefinition[] to OpenAI-compatible tools format for native tool calling */
export function formatToolsForAPI(tools: ToolDefinition[]): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string }>;
      required: string[];
    };
  };
}> {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          tool.parameters.map(p => [
            p.name,
            {
              type: p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string',
              description: p.description,
            },
          ])
        ),
        required: tool.parameters.filter(p => p.required).map(p => p.name),
      },
    },
  }));
}

/** Parse tool calls from LLM response text */
export function parseToolCalls(text: string): ToolCallResult[] {
  const toolCalls: ToolCallResult[] = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.tool && typeof parsed.tool === 'string') {
        toolCalls.push({
          toolName: parsed.tool,
          arguments: parsed.args || {},
          rawText: match[0],
        });
      }
    } catch {
      // Invalid JSON in tool call — skip
    }
  }
  
  return toolCalls;
}

/** Extract the text content from an LLM response, excluding tool call blocks */
export function extractTextContent(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .trim();
}

/** Tool executor type */
export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolExecutionResult>;

/** Registry of tool executors */
export interface ToolRegistry {
  register(toolName: string, executor: ToolExecutor): void;
  execute(toolCall: ToolCallResult): Promise<ToolExecutionResult>;
  has(toolName: string): boolean;
}

export function createToolRegistry(): ToolRegistry {
  const executors = new Map<string, ToolExecutor>();

  return {
    register(toolName: string, executor: ToolExecutor): void {
      executors.set(toolName, executor);
    },

    async execute(toolCall: ToolCallResult): Promise<ToolExecutionResult> {
      const start = Date.now();
      const executor = executors.get(toolCall.toolName);
      
      if (!executor) {
        return {
          toolName: toolCall.toolName,
          success: false,
          error: `Unknown tool: ${toolCall.toolName}`,
          duration: Date.now() - start,
        };
      }

      try {
        const result = await executor(toolCall.arguments);
        return {
          ...result,
          duration: Date.now() - start,
        };
      } catch (err: any) {
        return {
          toolName: toolCall.toolName,
          success: false,
          error: err.message || 'Tool execution failed',
          duration: Date.now() - start,
        };
      }
    },

    has(toolName: string): boolean {
      return executors.has(toolName);
    },
  };
}
