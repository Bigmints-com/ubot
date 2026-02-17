import { Request, Response } from 'express';
import { ShellService } from '../services/shellService.js';
import { ShellResult } from '../types/shell.js';

export class ShellController {
  private shellService: ShellService;

  constructor() {
    this.shellService = new ShellService();
  }

  public async executeCommand(req: Request, res: Response): Promise<void> {
    try {
      const { command } = req.body;

      if (typeof command !== 'string') {
        res.status(400).json({ error: 'Command must be a string' });
        return;
      }

      const result: ShellResult = await this.shellService.execute(command);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}