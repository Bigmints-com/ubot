/**
 * CLI Capability Service
 *
 * Manages CLI coding sessions using external CLI tools (Gemini CLI, Claude CLI, Codex CLI).
 * Spawns child processes, streams output, and manages session lifecycle.
 * Lazily initializes — only starts when first used.
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { log } from '../../logger/ring-buffer.js';

const UBOT_ROOT = process.env.UBOT_HOME || process.cwd();
import type { CliSession, CliServiceConfig } from './types.js';
import { CLI_BINARIES, CLI_PACKAGES, CLI_AUTH_COMMANDS } from './types.js';

const MAX_OUTPUT_LINES = 5000;
const MAX_SESSIONS = 50;

/** Callback fired when a CLI session completes or fails */
export type SessionCompleteCallback = (session: CliSession) => void;

export class CliService {
  private sessions: Map<string, CliSession> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private config: CliServiceConfig;
  private baseWorkDir: string;
  private onCompleteCallback: SessionCompleteCallback | null = null;

  constructor(config: CliServiceConfig) {
    this.config = config;
    this.baseWorkDir = path.isAbsolute(config.workDir)
      ? config.workDir
      : path.join(UBOT_ROOT, config.workDir);

    // Ensure base work directory exists
    if (!existsSync(this.baseWorkDir)) {
      mkdirSync(this.baseWorkDir, { recursive: true });
    }
  }

  /**
   * Check if the configured CLI provider binary is available on the system.
   */
  isProviderAvailable(provider?: string): boolean {
    const binary = CLI_BINARIES[provider || this.config.provider];
    if (!binary) return false;
    try {
      execSync(`which ${binary}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the CLI provider is authenticated / has valid credentials.
   * Each provider stores auth differently:
   *   - Gemini: OAuth creds in ~/.gemini/oauth_creds.json
   *   - Claude: Session data in ~/.claude/
   *   - Codex:  OPENAI_API_KEY env variable
   */
  isProviderAuthenticated(provider?: string): boolean {
    const p = provider || this.config.provider;
    const home = process.env.HOME || process.env.USERPROFILE || '';

    switch (p) {
      case 'gemini': {
        // Gemini CLI stores OAuth credentials after browser-based login
        const credsPath = path.join(home, '.gemini', 'oauth_creds.json');
        return existsSync(credsPath);
      }
      case 'claude': {
        // Claude CLI stores session data in ~/.claude/
        const claudeDir = path.join(home, '.claude');
        return existsSync(claudeDir);
      }
      case 'codex': {
        // Codex CLI uses OpenAI API key from environment
        return !!process.env.OPENAI_API_KEY;
      }
      default:
        return false;
    }
  }

  /**
   * Get full provider status for the UI.
   */
  getProviderInfo(): { provider: string; binary: string; available: boolean; authenticated: boolean } {
    const provider = this.config.provider;
    const binary = CLI_BINARIES[provider] || provider;
    return {
      provider,
      binary,
      available: this.isProviderAvailable(),
      authenticated: this.isProviderAuthenticated(),
    };
  }

  /**
   * Install a CLI provider via npm.
   * Returns the output and success status.
   */
  async installProvider(provider?: string): Promise<{ success: boolean; output: string }> {
    const p = provider || this.config.provider;
    const pkg = CLI_PACKAGES[p];
    if (!pkg) {
      return { success: false, output: `Unknown provider: ${p}` };
    }

    log.info('CLI', `Installing ${p} CLI: npm install -g ${pkg}`);

    return new Promise((resolve) => {
      const output: string[] = [];
      const child = spawn('npm', ['install', '-g', pkg], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      child.stdout?.on('data', (data: Buffer) => {
        output.push(data.toString());
      });
      child.stderr?.on('data', (data: Buffer) => {
        output.push(data.toString());
      });

      child.on('close', (code) => {
        const success = code === 0;
        log.info('CLI', `Install ${p} ${success ? 'succeeded' : `failed (code ${code})`}`);
        resolve({ success, output: output.join('') });
      });

      child.on('error', (err) => {
        log.error('CLI', `Install ${p} error: ${err.message}`);
        resolve({ success: false, output: err.message });
      });
    });
  }

  /**
   * Trigger authentication for a CLI provider.
   * For Gemini/Claude this runs the login command.
   * For Codex, auth is API-key based (not interactive).
   */
  async authenticateProvider(provider?: string): Promise<{ success: boolean; output: string }> {
    const p = provider || this.config.provider;
    const authCmd = CLI_AUTH_COMMANDS[p];
    if (!authCmd) {
      return { success: false, output: `Unknown provider: ${p}` };
    }

    if (p === 'codex') {
      return {
        success: false,
        output: 'Codex uses an API key. Set the OPENAI_API_KEY environment variable and restart UBOT.',
      };
    }

    if (!this.isProviderAvailable(p)) {
      return { success: false, output: `${p} CLI is not installed. Install it first.` };
    }

    log.info('CLI', `Authenticating ${p}: ${authCmd.cmd} ${authCmd.args.join(' ')}`);

    return new Promise((resolve) => {
      const output: string[] = [];
      const child = spawn(authCmd.cmd, authCmd.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: { ...process.env, TERM: 'dumb' },
      });

      child.stdout?.on('data', (data: Buffer) => {
        output.push(data.toString());
      });
      child.stderr?.on('data', (data: Buffer) => {
        output.push(data.toString());
      });

      // Timeout after 30s — auth commands may open a browser
      const timeout = setTimeout(() => {
        child.kill();
        resolve({ success: false, output: output.join('') + '\nAuth timed out — the CLI may have opened your browser. Run the auth command manually if needed.' });
      }, 30000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        const success = code === 0;
        log.info('CLI', `Auth ${p} ${success ? 'succeeded' : `exited (code ${code})`}`);
        resolve({ success, output: output.join('') });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        log.error('CLI', `Auth ${p} error: ${err.message}`);
        resolve({ success: false, output: err.message });
      });
    });
  }

  /**
   * Start a new CLI session with the given prompt.
   */
  async startSession(prompt: string, projectName?: string): Promise<CliSession> {
    const provider = this.config.provider;
    const binary = CLI_BINARIES[provider];

    if (!binary) {
      throw new Error(`Unknown CLI provider: ${provider}`);
    }

    if (!this.isProviderAvailable()) {
      throw new Error(
        `CLI provider "${provider}" is not installed. Please install "${binary}" and make sure it's on your PATH.`
      );
    }

    // Create project directory
    const safeName = (projectName || `session-${Date.now()}`)
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .substring(0, 64);
    const workDir = path.join(this.baseWorkDir, safeName);
    if (!existsSync(workDir)) {
      mkdirSync(workDir, { recursive: true });
    }

    const session: CliSession = {
      id: randomUUID(),
      prompt,
      provider,
      status: 'running',
      workDir,
      projectName: safeName,
      startedAt: new Date(),
      outputLines: [],
    };

    // Build command args based on provider
    const args = this.buildArgs(provider, prompt);

    log.info('CLI', `Starting ${provider} session ${session.id}: "${prompt.substring(0, 80)}..."`);

    // Spawn the process
    const child = spawn(binary, args, {
      cwd: workDir,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.processes.set(session.id, child);
    this.sessions.set(session.id, session);

    // Collect stdout
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.length > 0) {
          session.outputLines.push(line);
          // Cap output buffer
          if (session.outputLines.length > MAX_OUTPUT_LINES) {
            session.outputLines.shift();
          }
        }
      }
    });

    // Collect stderr
    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.length > 0) {
          session.outputLines.push(`[stderr] ${line}`);
          if (session.outputLines.length > MAX_OUTPUT_LINES) {
            session.outputLines.shift();
          }
        }
      }
    });

    // Handle process exit
    child.on('close', (code) => {
      session.exitCode = code ?? -1;
      session.endedAt = new Date();
      session.status = code === 0 ? 'completed' : (session.status === 'stopped' ? 'stopped' : 'failed');
      this.processes.delete(session.id);
      log.info('CLI', `Session ${session.id} ended with code ${code}`);
      // Fire completion callback
      if (this.onCompleteCallback) {
        try { this.onCompleteCallback(session); } catch (err: any) {
          log.error('CLI', `onComplete callback error: ${err.message}`);
        }
      }
    });

    child.on('error', (err) => {
      session.status = 'failed';
      session.endedAt = new Date();
      session.outputLines.push(`[error] ${err.message}`);
      this.processes.delete(session.id);
      log.error('CLI', `Session ${session.id} error: ${err.message}`);
      if (this.onCompleteCallback) {
        try { this.onCompleteCallback(session); } catch {} 
      }
    });

    // Set timeout
    if (this.config.timeout > 0) {
      setTimeout(() => {
        if (session.status === 'running') {
          log.warn('CLI', `Session ${session.id} timed out after ${this.config.timeout}ms`);
          this.stopSession(session.id);
          session.outputLines.push(`[system] Session timed out after ${Math.round(this.config.timeout / 1000)}s`);
        }
      }, this.config.timeout);
    }

    // Prune old sessions if we have too many
    this.pruneOldSessions();

    return session;
  }

  /**
   * Build CLI arguments based on the provider.
   */
  private buildArgs(provider: string, prompt: string): string[] {
    switch (provider) {
      case 'gemini':
        // Gemini CLI: gemini --yolo "prompt" (positional, -p is deprecated)
        return ['--yolo', prompt];
      case 'claude':
        // Claude CLI: claude -p "prompt" --dangerously-skip-permissions
        return ['-p', prompt, '--dangerously-skip-permissions'];
      case 'codex':
        // Codex CLI: codex "prompt"
        return [prompt];
      default:
        return [prompt];
    }
  }

  /**
   * Send input to a running session's stdin.
   */
  sendInput(sessionId: string, input: string): boolean {
    const child = this.processes.get(sessionId);
    if (!child || !child.stdin) return false;
    child.stdin.write(input);
    return true;
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): CliSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * List all sessions, most recent first.
   */
  listSessions(): CliSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  /**
   * Stop a running session.
   */
  stopSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    const child = this.processes.get(sessionId);

    if (!session) return false;

    if (child) {
      session.status = 'stopped';
      child.kill('SIGTERM');
      // Force kill after 5s
      setTimeout(() => {
        if (this.processes.has(sessionId)) {
          child.kill('SIGKILL');
          this.processes.delete(sessionId);
        }
      }, 5000);
    }

    return true;
  }

  /**
   * Get output lines from a session, optionally starting from a line number.
   */
  getOutput(sessionId: string, fromLine: number = 0): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.outputLines.slice(fromLine);
  }

  /**
   * Prune old completed sessions if we exceed the max.
   */
  private pruneOldSessions(): void {
    if (this.sessions.size <= MAX_SESSIONS) return;

    const sorted = this.listSessions();
    const toRemove = sorted
      .filter(s => s.status !== 'running')
      .slice(MAX_SESSIONS - 10); // Keep last N-10

    for (const session of toRemove) {
      this.sessions.delete(session.id);
    }
  }

  /**
   * Clean up all running sessions.
   */
  async shutdown(): Promise<void> {
    for (const [id] of this.processes) {
      this.stopSession(id);
    }
  }

  /**
   * Update the service config (e.g. when provider changes).
   */
  updateConfig(config: CliServiceConfig): void {
    this.config = config;
    this.baseWorkDir = path.isAbsolute(config.workDir)
      ? config.workDir
      : path.join(UBOT_ROOT, config.workDir);
    if (!existsSync(this.baseWorkDir)) {
      mkdirSync(this.baseWorkDir, { recursive: true });
    }
  }

  /**
   * Set a callback that fires when any CLI session completes or fails.
   */
  onComplete(callback: SessionCompleteCallback): void {
    this.onCompleteCallback = callback;
  }
}

// Singleton
let sharedInstance: CliService | null = null;

/**
 * Get or create the shared CLI service instance.
 * If config is provided and the instance already exists, updates the config.
 */
export function getCliService(config?: CliServiceConfig): CliService {
  if (!sharedInstance) {
    sharedInstance = new CliService(config || {
      provider: 'gemini',
      workDir: path.join(UBOT_ROOT, 'workspace', 'cli-projects'),
      timeout: 300000,
    });
  } else if (config) {
    // Always update config so provider changes take effect
    sharedInstance.updateConfig(config);
  }
  return sharedInstance;
}
