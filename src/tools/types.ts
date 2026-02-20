/**
 * Tool Module Framework — Types
 *
 * Standard interface for self-contained tool modules.
 * Each module defines its tool definitions AND registers its own executors.
 * This allows each service to live in its own file and be independently maintained.
 */

import type { ToolDefinition, ToolExecutionResult, ToolCallResult } from '../agent/types.js';

// Re-export for convenience
export type { ToolDefinition, ToolExecutionResult, ToolCallResult };

/** Executor function signature — takes args, returns result */
export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolExecutionResult>;

/** Registry interface — register tool executors, execute tool calls */
export interface ToolRegistry {
  register(toolName: string, executor: ToolExecutor): void;
  execute(toolCall: ToolCallResult): Promise<ToolExecutionResult>;
  has(toolName: string): boolean;
}

/**
 * Shared context passed to tool modules during registration.
 * Provides access to shared services without tight coupling to api.ts.
 */
export interface ToolContext {
  getMessagingRegistry(): any;
  getScheduler(): any | null;
  getApprovalStore(): any | null;
  getSkillEngine(): any | null;
  getWhatsApp(): any | null;
  getTelegram(): any | null;
  getAgent(): any | null;
  getEventBus(): any | null;
}

/**
 * Standard interface for a self-contained tool module.
 *
 * Each module provides:
 *   - name: identifier for logging/debugging
 *   - tools: ToolDefinition[] exposed to the LLM
 *   - register(): wires up executors using the shared ToolContext
 *
 * Example:
 * ```typescript
 * export default {
 *   name: 'my-service',
 *   tools: [
 *     { name: 'my_tool', description: '...', parameters: [...] },
 *   ],
 *   register(registry, ctx) {
 *     registry.register('my_tool', async (args) => {
 *       // implementation
 *       return { toolName: 'my_tool', success: true, result: '...', duration: 0 };
 *     });
 *   },
 * } satisfies ToolModule;
 * ```
 */
export interface ToolModule {
  /** Human-readable name for the module (e.g. 'google', 'web-search') */
  name: string;

  /** Tool definitions exposed to the LLM */
  tools: ToolDefinition[];

  /** Register executor functions with the tool registry */
  register(registry: ToolRegistry, ctx: ToolContext): void;
}

/**
 * Helper to create a standard tool result.
 */
export function toolResult(
  toolName: string,
  success: boolean,
  resultOrError: string,
): ToolExecutionResult {
  return {
    toolName,
    success,
    ...(success ? { result: resultOrError } : { error: resultOrError }),
    duration: 0,
  };
}

/**
 * Helper to wrap an async tool executor with error handling.
 */
export function safeExecutor(
  toolName: string,
  fn: (args: Record<string, unknown>) => Promise<string>,
): ToolExecutor {
  return async (args) => {
    try {
      const result = await fn(args);
      return toolResult(toolName, true, result);
    } catch (err: any) {
      console.error(`[${toolName}] Error:`, err.message);
      return toolResult(toolName, false, err.message);
    }
  };
}
