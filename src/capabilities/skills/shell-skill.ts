import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ShellSkillConfig {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ShellSkillResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
}

export interface ShellCommandOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export class ShellSkill {
  private defaultTimeout: number;
  private defaultCwd?: string;
  private defaultEnv?: NodeJS.ProcessEnv;

  constructor(config: ShellSkillConfig = {}) {
    this.defaultTimeout = config.timeout ?? 30000;
    this.defaultCwd = config.cwd;
    this.defaultEnv = config.env;
  }

  async execute(command: string, options: ShellCommandOptions = {}): Promise<ShellSkillResult> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const cwd = options.cwd ?? this.defaultCwd;
    const env = options.env ?? this.defaultEnv;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        cwd,
        env: env ?? process.env,
        maxBuffer: 1024 * 1024 * 10,
      });

      return {
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: 0,
        command,
      };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
      
      if (execError.killed) {
        return {
          stdout: execError.stdout ?? '',
          stderr: `Command timed out after ${timeout}ms`,
          exitCode: -1,
          command,
        };
      }

      return {
        stdout: execError.stdout ?? '',
        stderr: execError.stderr ?? String(error),
        exitCode: execError.code ?? 1,
        command,
      };
    }
  }

  async executeScript(script: string, options: ShellCommandOptions = {}): Promise<ShellSkillResult> {
    return this.execute(script, options);
  }
}