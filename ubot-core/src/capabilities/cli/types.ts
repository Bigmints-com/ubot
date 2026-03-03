/**
 * CLI Capability — Types
 */

export interface CliSession {
  id: string;
  prompt: string;
  provider: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  workDir: string;
  projectName: string;
  startedAt: Date;
  endedAt?: Date;
  exitCode?: number;
  outputLines: string[];
}

export interface CliServiceConfig {
  provider: string;
  workDir: string;
  timeout: number;
}

/** Map of provider name → binary command */
export const CLI_BINARIES: Record<string, string> = {
  gemini: 'gemini',
  claude: 'claude',
  codex: 'codex',
};

/** Map of provider name → npm package for installation */
export const CLI_PACKAGES: Record<string, string> = {
  gemini: '@google/gemini-cli',
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
};

/** Map of provider name → auth command to trigger login */
export const CLI_AUTH_COMMANDS: Record<string, { cmd: string; args: string[] }> = {
  gemini: { cmd: 'gemini', args: ['--login'] },
  claude: { cmd: 'claude', args: ['login'] },
  codex: { cmd: 'codex', args: ['--help'] }, // Codex uses API key, not interactive login
};
