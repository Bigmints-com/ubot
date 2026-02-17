import { exec } from 'child_process';
import { promisify } from 'util';
import type { ShellResult } from '../types/shell.js';

const execAsync = promisify(exec);

export async function executeCommand(command: string, timeout: number = 10000): Promise<ShellResult> {
    try {
        const { stdout, stderr } = await execAsync(command, { timeout });
        return {
            success: true,
            stdout,
            stderr: stderr || '',
            exitCode: 0,
            timestamp: new Date()
        };
    } catch (error: any) {
        return {
            success: false,
            stdout: '',
            stderr: error.message,
            exitCode: error.code || 1,
            timestamp: new Date()
        };
    }
}