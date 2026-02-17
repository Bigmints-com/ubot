import { Request, Response } from 'express';
import { executeCommand } from '../services/shellService.js';
import type { ShellCommand } from '../types/shell.js';

export async function runShellCommand(req: Request, res: Response) {
    const { command, timeout } = req.body as ShellCommand;
    const result = await executeCommand(command, timeout);
    res.json(result);
}