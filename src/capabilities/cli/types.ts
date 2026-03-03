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

/**
 * Well-known provider defaults — used as fallback when config doesn't
 * specify command/package/authArgs. Users can add any provider; unknown
 * ones default to using the provider key as the binary name.
 */
export const CLI_PROVIDER_DEFAULTS: Record<string, { command: string; package: string; authArgs: string[] }> = {
  gemini: { command: 'gemini', package: '@google/gemini-cli', authArgs: ['--login'] },
  claude: { command: 'claude', package: '@anthropic-ai/claude-code', authArgs: ['login'] },
  codex:  { command: 'codex',  package: '@openai/codex',             authArgs: ['--help'] },
};

/** Resolve the binary command for a provider. Config overrides take priority. */
export function resolveCliCommand(provider: string, configOverride?: string): string {
  return configOverride || CLI_PROVIDER_DEFAULTS[provider]?.command || provider;
}

/** Resolve the npm package for a provider. */
export function resolveCliPackage(provider: string, configOverride?: string): string {
  return configOverride || CLI_PROVIDER_DEFAULTS[provider]?.package || provider;
}

/** Resolve auth args for a provider. */
export function resolveCliAuthArgs(provider: string, configOverride?: string[]): { cmd: string; args: string[] } {
  const cmd = resolveCliCommand(provider);
  const args = configOverride || CLI_PROVIDER_DEFAULTS[provider]?.authArgs || ['--help'];
  return { cmd, args };
}
