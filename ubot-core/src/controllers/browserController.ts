import { Request, Response } from 'express';
import { BrowserService } from '../services/browserService.js';
import { BrowserConfig } from '../types/browser.js';

const browserService = new BrowserService();

export const browserController = {
  execute: async (req: Request, res: Response): Promise<void> => {
    try {
      const config: BrowserConfig = req.body;

      if (!config.url || !config.action) {
        res.status(400).json({ success: false, error: 'URL and action are required' });
        return;
      }

      const result = await browserService.execute(config);

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
};