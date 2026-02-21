/**
 * Agent Tools
 * Platform-agnostic tool definitions for the agent.
 * These tools work with any messaging provider (WhatsApp, Telegram, iMessage).
 */

import type { ToolDefinition, ToolCallResult, ToolExecutionResult } from './types.js';

import { getAllToolDefinitions } from '../tools/registry.js';

/** All available tool definitions for prompt injection — dynamically loaded from tool modules */
export const AGENT_TOOLS: ToolDefinition[] = getAllToolDefinitions();

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
  // Include dynamically registered MCP tools
  let allTools = [...AGENT_TOOLS];
  try {
    const { getMcpServerManager } = require('../integrations/mcp/mcp-manager.js');
    const mgr = getMcpServerManager();
    const mcpDefs = mgr.getMcpToolDefinitions();
    if (mcpDefs.length > 0) allTools = [...allTools, ...mcpDefs];
  } catch {}

  if (isOwner) return allTools;
  return allTools.filter(t => VISITOR_SAFE_TOOL_NAMES.has(t.name));
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
