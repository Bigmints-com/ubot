/**
 * Subagent Runner
 *
 * Spawns isolated agent loops for delegated sub-tasks.
 * Inspired by DeerFlow's SubagentExecutor pattern.
 */

import { log } from '../logger/ring-buffer.js';
import type { SubagentConfig, SubagentResult, SubagentStatus } from './subagent-types.js';

/** Minimal interface for the orchestrator's chat method */
interface ChatInterface {
  chat(
    sessionId: string,
    userMessage: string,
    systemPromptOverride?: string,
  ): Promise<{ content: string; toolCalls?: any[]; duration?: number }>;
}

/**
 * Run a sub-task in an isolated agent session.
 *
 * Creates a one-shot session, executes the task with the orchestrator's
 * chat method, and returns a structured SubagentResult. Never throws —
 * all errors are captured in the result.
 */
export async function runSubagent(
  config: SubagentConfig,
  task: string,
  orchestrator: ChatInterface,
): Promise<SubagentResult> {
  const taskId = `sub-${config.name}-${Date.now().toString(36)}`;
  const sessionId = `subagent-${config.name}-${Date.now()}`;
  const timeoutMs = config.timeoutMs ?? 120_000;
  const startedAt = new Date();

  log.info('Subagent', `[${config.name}] Starting task ${taskId} (timeout ${timeoutMs / 1000}s)`);

  // Build the full prompt: inject subagent context before the actual task
  const fullPrompt = config.systemPrompt
    ? `[System context for this sub-task: ${config.systemPrompt}]\n\nTask: ${task}`
    : task;

  try {
    // Race between execution and timeout
    const result = await Promise.race<{ content: string; toolCalls?: any[]; duration?: number }>([
      orchestrator.chat(sessionId, fullPrompt, config.systemPrompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SUBAGENT_TIMEOUT')), timeoutMs),
      ),
    ]);

    const completedAt = new Date();
    const toolCallCount = result.toolCalls?.length ?? 0;

    log.info(
      'Subagent',
      `[${config.name}] Completed task ${taskId} (${toolCallCount} tool calls, ${completedAt.getTime() - startedAt.getTime()}ms)`,
    );

    return {
      taskId,
      status: 'completed' as SubagentStatus,
      result: result.content,
      startedAt,
      completedAt,
      toolCalls: toolCallCount,
      iterations: 1, // Single chat invocation
    };
  } catch (err: any) {
    const completedAt = new Date();
    const isTimeout = err.message === 'SUBAGENT_TIMEOUT';
    const status: SubagentStatus = isTimeout ? 'timed_out' : 'failed';

    log.warn(
      'Subagent',
      `[${config.name}] ${isTimeout ? 'Timed out' : 'Failed'} task ${taskId}: ${err.message}`,
    );

    return {
      taskId,
      status,
      error: isTimeout
        ? `Subagent timed out after ${timeoutMs / 1000}s`
        : err.message,
      startedAt,
      completedAt,
      toolCalls: 0,
      iterations: 0,
    };
  }
}
