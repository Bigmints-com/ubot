import { Request, Response } from 'express';
import { executeShellCommand } from '../services/shellService.js';
import { ShellCommandRequest } from '../types/shell.js';

export async function shellCommand(req: Request, res: Response): Promise<void> {
  try {
    const { command, timeout } = req.body as ShellCommandRequest;

    if (!command) {
      res.status(400).json({ error: 'Command is required' });
      return;
    }

    const result = await executeShellCommand(command, timeout);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}