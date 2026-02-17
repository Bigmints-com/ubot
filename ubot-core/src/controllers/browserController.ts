import { Request, Response } from 'express';
import { browserService } from '../services/browserService.js';
import { BrowserConfig } from '../types/browser.js';

export const browserController = {
  launch: async (req: Request, res: Response): Promise<void> => {
    const config: BrowserConfig = req.body;
    const result = await browserService.launch(config);
    res.json(result);
  },

  navigate: async (req: Request, res: Response): Promise<void> => {
    const { url, waitUntil } = req.body;
    const result = await browserService.navigate(url, waitUntil);
    res.json(result);
  },

  screenshot: async (req: Request, res: Response): Promise<void> => {
    const { pageId } = req.query;
    const result = await browserService.screenshot(String(pageId));
    res.json(result);
  },

  close: async (req: Request, res: Response): Promise<void> => {
    const result = await browserService.close();
    res.json(result);
  },
};