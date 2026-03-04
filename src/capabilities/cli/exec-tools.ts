/**
 * Exec / Process Tool Module
 *
 * Direct shell command execution with background process management.
 * Unlike cli_run (which spawns AI coding agents), exec runs raw commands.
 *
 * Security: restricted to workspace + allowed_paths by default.
 * Owner-only: non-owner sessions cannot execute commands.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../../tools/types.js';
import { loadUbotConfig } from '../../data/config.js';

// ─── Background Session Store ─────────────────────────────

interface ExecSession {
  id: string;
  command: string;
  process: ChildProcess | null;
  output: string[];         // ring buffer of output lines
  maxOutputLines: number;
  exitCode: number | null;
  startTime: number;
  endTime: number | null;
  lastPollIndex: number;    // for poll delta tracking
}

const sessions = new Map<string, ExecSession>();
const MAX_OUTPUT_LINES = 5000;
let sessionCounter = 0;

function generateSessionId(): string {
  return `exec-${Date.now()}-${++sessionCounter}`;
}

function cleanupOldSessions(): void {
  const MAX_SESSIONS = 50;
  const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
  if (sessions.size <= MAX_SESSIONS) return;
  const now = Date.now();
  for (const [id, sess] of sessions) {
    if (sess.endTime && (now - sess.endTime) > MAX_AGE_MS) {
      sessions.delete(id);
    }
  }
}

// ─── Security ─────────────────────────────────────────────

function getExecConfig(): { enabled: boolean; security: string; maxTimeout: number } {
  const cfg = loadUbotConfig();
  const exec = (cfg.capabilities as any)?.exec;
  return {
    enabled: exec?.enabled !== false,
    security: exec?.security || 'allowed',  // 'workspace' | 'allowed' | 'full'
    maxTimeout: exec?.max_timeout || 300,
  };
}

function getWorkingDir(ctx: ToolContext, requestedCwd?: string): string {
  const workspace = ctx.getWorkspacePath() || process.cwd();
  if (!requestedCwd) return workspace;

  const resolved = path.resolve(requestedCwd);
  const config = getExecConfig();

  if (config.security === 'full') return resolved;

  // Check workspace
  if (resolved.startsWith(path.resolve(workspace))) return resolved;

  if (config.security === 'allowed') {
    // Check allowed paths
    const ubotCfg = loadUbotConfig();
    const allowedPaths = ubotCfg.capabilities?.filesystem?.allowed_paths || [];
    for (const p of allowedPaths) {
      const expanded = p.startsWith('~')
        ? path.join(process.env.HOME || '', p.slice(1))
        : p;
      if (resolved.startsWith(path.resolve(expanded))) return resolved;
    }
  }

  return workspace; // fallback to workspace
}

// ─── Tool Definitions ─────────────────────────────────────

const EXEC_TOOLS: ToolDefinition[] = [
  {
    name: 'exec',
    description: 'Execute a shell command. Returns stdout/stderr. Use "background: true" for long-running commands, then use "process" tool to poll results.',
    parameters: [
      { name: 'command', type: 'string', description: 'Shell command to execute', required: true },
      { name: 'timeout', type: 'number', description: 'Timeout in seconds (default 30, max 300)', required: false },
      { name: 'background', type: 'boolean', description: 'Run in background (returns session_id)', required: false },
      { name: 'cwd', type: 'string', description: 'Working directory (defaults to workspace)', required: false },
    ],
  },
  {
    name: 'process',
    description: 'Manage background exec sessions. Actions: list (all sessions), poll (new output + status), log (last N lines), kill (terminate process).',
    parameters: [
      { name: 'action', type: 'string', description: '"list", "poll", "log", or "kill"', required: true },
      { name: 'session_id', type: 'string', description: 'Session ID (required for poll/log/kill)', required: false },
      { name: 'lines', type: 'number', description: 'Number of lines for "log" action (default 50)', required: false },
    ],
  },
];

// ─── Module ───────────────────────────────────────────────

const execToolModule: ToolModule = {
  name: 'exec',
  tools: EXEC_TOOLS,
  register(registry: ToolRegistry, ctx: ToolContext) {

    // ── exec ──────────────────────────────────────────────
    registry.register('exec', async (args) => {
      const command = String(args.command || '').trim();
      if (!command) return { toolName: 'exec', success: false, error: 'Missing "command" parameter', duration: 0 };

      const config = getExecConfig();
      if (!config.enabled) {
        return { toolName: 'exec', success: false, error: 'Exec capability is disabled. Enable it in config.', duration: 0 };
      }

      const timeout = Math.min(Math.max(Number(args.timeout) || 30, 1), config.maxTimeout);
      const background = args.background === true || args.background === 'true';
      const cwd = getWorkingDir(ctx, args.cwd as string | undefined);
      const start = Date.now();

      console.log(`[exec] Running: ${command} (timeout: ${timeout}s, bg: ${background}, cwd: ${cwd})`);

      const sessionId = generateSessionId();
      const session: ExecSession = {
        id: sessionId,
        command,
        process: null,
        output: [],
        maxOutputLines: MAX_OUTPUT_LINES,
        exitCode: null,
        startTime: start,
        endTime: null,
        lastPollIndex: 0,
      };

      const child = spawn('sh', ['-c', command], {
        cwd,
        env: { ...process.env, PAGER: 'cat' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      session.process = child;
      sessions.set(sessionId, session);
      cleanupOldSessions();

      const appendLine = (line: string) => {
        session.output.push(line);
        if (session.output.length > session.maxOutputLines) {
          session.output.shift();
        }
      };

      child.stdout?.on('data', (data: Buffer) => {
        data.toString().split('\n').forEach(line => { if (line) appendLine(line); });
      });
      child.stderr?.on('data', (data: Buffer) => {
        data.toString().split('\n').forEach(line => { if (line) appendLine(`[stderr] ${line}`); });
      });

      child.on('close', (code) => {
        session.exitCode = code;
        session.endTime = Date.now();
        session.process = null;
      });

      if (background) {
        // Return immediately
        return {
          toolName: 'exec',
          success: true,
          result: JSON.stringify({
            session_id: sessionId,
            status: 'running',
            message: `Command started in background. Use process(action="poll", session_id="${sessionId}") to check on it.`,
          }),
          duration: Date.now() - start,
        };
      }

      // Synchronous: wait for completion or timeout
      return new Promise<any>((resolve) => {
        const timeoutHandle = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => { if (!session.endTime) child.kill('SIGKILL'); }, 3000);
          resolve({
            toolName: 'exec',
            success: false,
            error: `Command timed out after ${timeout}s. Output so far:\n${session.output.slice(-50).join('\n')}`,
            duration: Date.now() - start,
          });
        }, timeout * 1000);

        child.on('close', (code) => {
          clearTimeout(timeoutHandle);
          const output = session.output.join('\n');
          resolve({
            toolName: 'exec',
            success: code === 0,
            ...(code === 0
              ? { result: output || '(no output)' }
              : { error: `Exit code ${code}\n${output}` }),
            duration: Date.now() - start,
          });
        });
      });
    });

    // ── process ───────────────────────────────────────────
    registry.register('process', async (args) => {
      const action = String(args.action || '').toLowerCase();
      const sessionId = String(args.session_id || '');
      const start = Date.now();

      if (action === 'list') {
        const list = [...sessions.values()].map(s => ({
          session_id: s.id,
          command: s.command.slice(0, 100),
          status: s.exitCode !== null ? 'completed' : 'running',
          exit_code: s.exitCode,
          lines: s.output.length,
          started: new Date(s.startTime).toISOString(),
          duration: ((s.endTime || Date.now()) - s.startTime) / 1000,
        }));
        return {
          toolName: 'process',
          success: true,
          result: JSON.stringify({ sessions: list, count: list.length }, null, 2),
          duration: Date.now() - start,
        };
      }

      if (!sessionId) {
        return { toolName: 'process', success: false, error: 'Missing "session_id" parameter', duration: 0 };
      }

      const session = sessions.get(sessionId);
      if (!session) {
        return { toolName: 'process', success: false, error: `Session "${sessionId}" not found`, duration: 0 };
      }

      if (action === 'poll') {
        const newLines = session.output.slice(session.lastPollIndex);
        session.lastPollIndex = session.output.length;
        return {
          toolName: 'process',
          success: true,
          result: JSON.stringify({
            status: session.exitCode !== null ? 'completed' : 'running',
            exit_code: session.exitCode,
            new_output: newLines.join('\n'),
            new_lines: newLines.length,
            total_lines: session.output.length,
          }),
          duration: Date.now() - start,
        };
      }

      if (action === 'log') {
        const lines = Math.min(Number(args.lines) || 50, 500);
        const tail = session.output.slice(-lines);
        return {
          toolName: 'process',
          success: true,
          result: tail.join('\n') || '(no output)',
          duration: Date.now() - start,
        };
      }

      if (action === 'kill') {
        if (!session.process) {
          return {
            toolName: 'process',
            success: true,
            result: `Session "${sessionId}" already completed (exit ${session.exitCode})`,
            duration: 0,
          };
        }
        session.process.kill('SIGTERM');
        setTimeout(() => { if (session.process) session.process.kill('SIGKILL'); }, 5000);
        return {
          toolName: 'process',
          success: true,
          result: `Sent SIGTERM to session "${sessionId}"`,
          duration: Date.now() - start,
        };
      }

      return { toolName: 'process', success: false, error: `Unknown action "${action}". Use: list, poll, log, kill`, duration: 0 };
    });
  },
};

export default execToolModule;
