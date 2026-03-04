/**
 * Sessions Tool Module
 *
 * Sub-agent orchestration: spawn specialized agent sessions,
 * send follow-up messages, and check session status.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';

// ─── Session Store ────────────────────────────────────────

interface SpawnedSession {
  id: string;
  task: string;
  agentId: string | null;
  status: 'running' | 'completed' | 'failed';
  result: string | null;
  error: string | null;
  startTime: number;
  endTime: number | null;
  depth: number;
}

const spawnedSessions = new Map<string, SpawnedSession>();
const MAX_DEPTH = 3;
let sessionCounter = 0;

// Track current spawn depth per parent session
const depthTracker = new Map<string, number>();

// ─── Tool Definitions ─────────────────────────────────────

const SESSION_TOOLS: ToolDefinition[] = [
  {
    name: 'sessions_spawn',
    description: 'Spawn a sub-agent session to handle a task. The sub-agent runs independently and returns a result. Use for delegating complex sub-tasks.',
    parameters: [
      { name: 'task', type: 'string', description: 'Task description for the sub-agent', required: true },
      { name: 'agent_id', type: 'string', description: 'Optional specialized agent ID to use', required: false },
      { name: 'timeout', type: 'number', description: 'Timeout in seconds (default 120)', required: false },
    ],
  },
  {
    name: 'sessions_list',
    description: 'List all spawned sub-agent sessions with their status and results.',
    parameters: [],
  },
  {
    name: 'sessions_status',
    description: 'Check the status of a spawned session.',
    parameters: [
      { name: 'session_id', type: 'string', description: 'Session ID to check', required: true },
    ],
  },
  {
    name: 'sessions_send',
    description: 'Send a follow-up message to a spawned session.',
    parameters: [
      { name: 'session_id', type: 'string', description: 'Session ID to send to', required: true },
      { name: 'message', type: 'string', description: 'Follow-up message', required: true },
    ],
  },
];

// ─── Module ───────────────────────────────────────────────

const sessionsToolModule: ToolModule = {
  name: 'sessions',
  tools: SESSION_TOOLS,
  register(registry: ToolRegistry, ctx: ToolContext) {

    // ── sessions_spawn ────────────────────────────────────
    registry.register('sessions_spawn', async (args) => {
      const task = String(args.task || '').trim();
      if (!task) return { toolName: 'sessions_spawn', success: false, error: 'Missing "task" parameter', duration: 0 };

      const agentId = args.agent_id ? String(args.agent_id) : null;
      const timeout = Math.min(Number(args.timeout) || 120, 600);
      const start = Date.now();

      // Depth check
      const currentDepth = depthTracker.get('current') || 0;
      if (currentDepth >= MAX_DEPTH) {
        return {
          toolName: 'sessions_spawn',
          success: false,
          error: `Max sub-agent nesting depth (${MAX_DEPTH}) reached. Cannot spawn another sub-agent.`,
          duration: 0,
        };
      }

      const orchestrator = ctx.getAgent() as any;
      if (!orchestrator?.chat) {
        return {
          toolName: 'sessions_spawn',
          success: false,
          error: 'Agent orchestrator not available for sub-agent spawning',
          duration: 0,
        };
      }

      const sessionId = `sub-${Date.now()}-${++sessionCounter}`;
      const session: SpawnedSession = {
        id: sessionId,
        task,
        agentId,
        status: 'running',
        result: null,
        error: null,
        startTime: start,
        endTime: null,
        depth: currentDepth + 1,
      };
      spawnedSessions.set(sessionId, session);

      console.log(`[sessions] Spawning sub-agent "${sessionId}" (depth ${session.depth}): ${task.slice(0, 100)}`);

      try {
        // Set depth for the sub-agent
        depthTracker.set('current', session.depth);

        // If agentId specified, switch agent context
        if (agentId) {
          orchestrator.switchAgent?.(sessionId, agentId);
        }

        // Run with timeout
        const result = await Promise.race([
          orchestrator.chat(sessionId, task, 'web', 'sub-agent', true),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Sub-agent timed out after ${timeout}s`)), timeout * 1000)
          ),
        ]);

        session.status = 'completed';
        session.result = result.content;
        session.endTime = Date.now();

        console.log(`[sessions] Sub-agent "${sessionId}" completed (${((session.endTime - start) / 1000).toFixed(1)}s)`);

        return {
          toolName: 'sessions_spawn',
          success: true,
          result: JSON.stringify({
            session_id: sessionId,
            status: 'completed',
            response: result.content,
            tools_used: result.toolCalls?.length || 0,
            duration_ms: session.endTime - start,
          }),
          duration: Date.now() - start,
        };
      } catch (err: any) {
        session.status = 'failed';
        session.error = err.message;
        session.endTime = Date.now();
        return {
          toolName: 'sessions_spawn',
          success: false,
          error: `Sub-agent failed: ${err.message}`,
          duration: Date.now() - start,
        };
      } finally {
        // Restore depth
        depthTracker.set('current', currentDepth);
      }
    });

    // ── sessions_list ─────────────────────────────────────
    registry.register('sessions_list', async () => {
      const list = [...spawnedSessions.values()].map(s => ({
        session_id: s.id,
        task: s.task.slice(0, 100),
        agent: s.agentId || 'default',
        status: s.status,
        depth: s.depth,
        started: new Date(s.startTime).toISOString(),
        duration: s.endTime ? `${((s.endTime - s.startTime) / 1000).toFixed(1)}s` : 'running',
      }));
      return {
        toolName: 'sessions_list',
        success: true,
        result: JSON.stringify({ sessions: list, count: list.length }, null, 2),
        duration: 0,
      };
    });

    // ── sessions_status ───────────────────────────────────
    registry.register('sessions_status', async (args) => {
      const sessionId = String(args.session_id || '');
      if (!sessionId) return { toolName: 'sessions_status', success: false, error: 'Missing "session_id"', duration: 0 };

      const session = spawnedSessions.get(sessionId);
      if (!session) {
        return { toolName: 'sessions_status', success: false, error: `Session "${sessionId}" not found`, duration: 0 };
      }

      return {
        toolName: 'sessions_status',
        success: true,
        result: JSON.stringify({
          session_id: session.id,
          status: session.status,
          result: session.result?.slice(0, 2000),
          error: session.error,
          duration: session.endTime ? `${((session.endTime - session.startTime) / 1000).toFixed(1)}s` : 'running',
        }),
        duration: 0,
      };
    });

    // ── sessions_send ─────────────────────────────────────
    registry.register('sessions_send', async (args) => {
      const sessionId = String(args.session_id || '');
      const message = String(args.message || '').trim();
      if (!sessionId) return { toolName: 'sessions_send', success: false, error: 'Missing "session_id"', duration: 0 };
      if (!message) return { toolName: 'sessions_send', success: false, error: 'Missing "message"', duration: 0 };

      const session = spawnedSessions.get(sessionId);
      if (!session) {
        return { toolName: 'sessions_send', success: false, error: `Session "${sessionId}" not found`, duration: 0 };
      }

      const orchestrator = ctx.getAgent() as any;
      if (!orchestrator?.chat) {
        return { toolName: 'sessions_send', success: false, error: 'Agent orchestrator not available', duration: 0 };
      }

      const start = Date.now();
      try {
        const result = await orchestrator.chat(sessionId, message, 'web', 'sub-agent', true);
        session.result = result.content;
        return {
          toolName: 'sessions_send',
          success: true,
          result: result.content,
          duration: Date.now() - start,
        };
      } catch (err: any) {
        return { toolName: 'sessions_send', success: false, error: err.message, duration: Date.now() - start };
      }
    });
  },
};

export default sessionsToolModule;
