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
    name: 'ask_owner',
    description: 'Ask the owner for approval or guidance. Use when a third party requests specific private information, wants to make financial or scheduling commitments, or asks for anything sensitive that you cannot confidently answer from your persona docs. You MUST actually call this tool — do not just say you will check with the owner without calling it.',
    parameters: [
      { name: 'question', type: 'string', description: 'The specific sensitive question requiring owner input', required: true },
      { name: 'context', type: 'string', description: 'Who is asking and why this cannot be answered from persona (e.g. "Ahmed wants your exact bank account number")', required: true },
      { name: 'requester_jid', type: 'string', description: 'The JID or phone number of the person waiting for a response', required: true },
    ],
  },
  {
    name: 'respond_to_approval',
    description: 'Respond to a pending approval request. Use when the owner provides their answer to an approval in the Command Center chat. The response will be relayed back to the original requester.',
    parameters: [
      { name: 'approval_id', type: 'string', description: 'The approval ID (e.g. "apr_..."). If not provided, responds to the most recent pending approval.', required: false },
      { name: 'response', type: 'string', description: 'The owner\'s response message to relay to the requester', required: true },
    ],
  },
  {
    name: 'list_pending_approvals',
    description: 'List all pending approval requests that are waiting for the owner\'s response.',
    parameters: [],
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
  // ── Browser Automation Tools ────────────────────────────
  {
    name: 'browse_url',
    description: 'Open a URL in the browser and return the page title and visible text content. Use this to visit websites, read Gmail, view Google Calendar, etc.',
    parameters: [
      { name: 'url', type: 'string', description: 'Full URL to navigate to (e.g. https://mail.google.com)', required: true },
    ],
  },
  {
    name: 'browser_click',
    description: 'Click an element on the current browser page using a CSS selector',
    parameters: [
      { name: 'selector', type: 'string', description: 'CSS selector of the element to click (e.g. "button.compose", "a[href=\'/inbox\']", "#submit-btn")', required: true },
    ],
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field on the current browser page',
    parameters: [
      { name: 'selector', type: 'string', description: 'CSS selector of the input field', required: true },
      { name: 'text', type: 'string', description: 'Text to type into the field', required: true },
    ],
  },
  {
    name: 'browser_read_page',
    description: 'Read the visible text content from the current browser page, or from a specific element. Use after browse_url to read page content.',
    parameters: [
      { name: 'selector', type: 'string', description: 'Optional CSS selector to read text from a specific element. Omit to read the full page.', required: false },
    ],
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current browser page. Returns a base64-encoded image.',
    parameters: [],
  },
  // ── Scheduler & Reminder Tools ────────────────────────
  {
    name: 'create_reminder',
    description: 'Create a reminder for the owner. The reminder message will be sent back to the owner at the specified time via their connected messaging channel (Telegram/WhatsApp). Use this when the owner says things like "Remind me to...", "Don\'t forget to...", "Set a reminder for...".',
    parameters: [
      { name: 'message', type: 'string', description: 'What to remind about (e.g. "Call home", "Take medicine", "Meeting with John")', required: true },
      { name: 'time', type: 'string', description: 'When to remind. Supports natural language: "in 30 minutes", "at 3:00pm", "tomorrow at 9am", "next Monday at 10am", or ISO date string.', required: true },
      { name: 'recurrence', type: 'string', description: 'Optional recurrence: "once" (default), "daily", "weekly", "monthly"', required: false },
    ],
  },
  {
    name: 'list_schedules',
    description: 'List all active scheduled tasks, reminders, and scheduled messages. Shows task ID, name, status, next run time, and recurrence.',
    parameters: [
      { name: 'status', type: 'string', description: 'Filter by status: "pending", "running", "completed", "failed", "cancelled", "paused". Default: show all active.', required: false },
    ],
  },
  {
    name: 'delete_schedule',
    description: 'Delete/cancel a scheduled task or reminder by its ID.',
    parameters: [
      { name: 'task_id', type: 'string', description: 'The ID of the scheduled task to delete', required: true },
    ],
  },
  {
    name: 'trigger_schedule',
    description: 'Run a scheduled task immediately, regardless of its next scheduled time.',
    parameters: [
      { name: 'task_id', type: 'string', description: 'The ID of the scheduled task to trigger now', required: true },
    ],
  },
  {
    name: 'forward_message',
    description: 'Forward a message to another contact. Finds the message in history and sends its content to the specified recipient.',
    parameters: [
      { name: 'to', type: 'string', description: 'Recipient phone number with country code or contact ID', required: true },
      { name: 'text', type: 'string', description: 'The text to forward. Use search_messages first to find the exact content.', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel (whatsapp, telegram). Defaults to connected one.', required: false },
    ],
  },
];

/**
 * Tools safe for visitor (non-owner) sessions.
 * The bot acts as a secretary for the owner:
 *   - Answers from persona knowledge (no tool needed)
 *   - Escalates to owner when unsure (ask_owner)
 * Everything else (browse, messages, contacts, skills, web search, etc.)
 * is OWNER-ONLY to prevent information leakage and misuse.
 */
export const VISITOR_SAFE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'ask_owner',
]);

/** Get the filtered tool list based on whether the caller is the owner */
export function getToolsForSource(isOwner: boolean): ToolDefinition[] {
  if (isOwner) return AGENT_TOOLS;
  return AGENT_TOOLS.filter(t => VISITOR_SAFE_TOOL_NAMES.has(t.name));
}

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
