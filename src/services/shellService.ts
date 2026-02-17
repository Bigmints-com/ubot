import pino from 'pino';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ShellResult } from '../types/shell.js';

const execAsync = promisify(exec);
const logger = pino();

export class ShellService {
  public async execute(command: string): Promise<ShellResult> {
    logger.info(`Executing shell command: ${command}`);
    try {
      const { stdout, stderr } = await execAsync(command);
      return {
        command,
        stdout,
        stderr: stderr || '',
        exitCode: 0,
        timestamp: new Date(),
      };
    } catch (error: any) {
      logger.error(`Shell command failed: ${error.message}`);
      return {
        command,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        timestamp: new Date(),
      };
    }
  }
}