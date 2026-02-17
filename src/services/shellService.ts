import { spawn } from 'child_process';
import { logger } from './logger.js';
import { ShellCommandResponse } from '../types/shell.js';

export async function executeShellCommand(command: string, timeout = 10000): Promise<ShellCommandResponse> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(command, [], { shell: true });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const duration = Date.now() - start;
      logger.info(`Shell command executed: ${command} with exit code ${code}`);
      resolve({
        success: code === 0,
        stdout,
        stderr,
        exitCode: code ?? 0,
        timestamp: new Date().toISOString()
      });
    });

    child.on('error', (err) => {
      logger.error(`Shell command error: ${err.message}`);
      resolve({
        success: false,
        stdout,
        stderr: err.message,
        exitCode: 1,
        timestamp: new Date().toISOString()
      });
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        stdout,
        stderr: 'Command timed out',
        exitCode: 1,
        timestamp: new Date().toISOString()
      });
    }, timeout);

    child.on('close', () => clearTimeout(timer));
  });
}