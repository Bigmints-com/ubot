import puppeteer from 'puppeteer';
import { logger } from '../services/logger.js';
import { BrowserConfig, BrowserResult } from '../types/browser.js';

export class BrowserService {
  private browser: puppeteer.Browser | null = null;

  async launch(): Promise<puppeteer.Browser> {
    if (this.browser) {
      return this.browser;
    }

    try {
      logger.info('Launching browser...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      logger.info('Browser launched successfully.');
      return this.browser;
    } catch (error) {
      logger.error('Failed to launch browser', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed.');
    }
  }

  async execute(config: BrowserConfig): Promise<BrowserResult> {
    let page: puppeteer.Page | null = null;

    try {
      const browser = await this.launch();
      page = await browser.newPage();

      await page.goto(config.url, {
        waitUntil: config.waitUntil || 'domcontentloaded',
      });

      let result: string;

      if (config.action === 'text') {
        if (!config.selector) {
          throw new Error('Selector is required for text action');
        }
        result = await page.$eval(config.selector, (el) => el.textContent || '');
      } else if (config.action === 'html') {
        result = await page.content();
      } else if (config.action === 'screenshot') {
        result = await page.screenshot({ encoding: 'base64' });
      } else {
        throw new Error(`Unsupported action: ${config.action}`);
      }

      return { success: true, data: result };
    } catch (error) {
      logger.error('Browser execution failed', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }
}