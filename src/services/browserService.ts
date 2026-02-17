import puppeteer from 'puppeteer';
import { logger } from './logger.js';
import { BrowserConfig, BrowserAction, BrowserResponse } from '../types/browser.js';

class BrowserService {
  private browser: puppeteer.Browser | null = null;

  async launch(config: BrowserConfig = { headless: true, args: [] }): Promise<BrowserResponse> {
    try {
      if (this.browser) {
        return { success: false, error: 'Browser instance already running' };
      }

      this.browser = await puppeteer.launch({
        headless: config.headless,
        args: config.args,
      });

      logger.info('Browser launched successfully');
      return { success: true, data: 'Browser instance ready' };
    } catch (error) {
      logger.error('Failed to launch browser', error);
      return { success: false, error: String(error) };
    }
  }

  async navigate(url: string, waitUntil: BrowserAction['waitUntil'] = 'load'): Promise<BrowserResponse> {
    if (!this.browser) {
      return { success: false, error: 'Browser not launched' };
    }

    try {
      const page = await this.browser.newPage();
      await page.goto(url, { waitUntil });
      logger.info(`Navigated to ${url}`);
      return { success: true, data: { pageId: page.id(), url } };
    } catch (error) {
      logger.error(`Failed to navigate to ${url}`, error);
      return { success: false, error: String(error) };
    }
  }

  async screenshot(pageId: string): Promise<BrowserResponse> {
    if (!this.browser) {
      return { success: false, error: 'Browser not launched' };
    }

    try {
      const pages = await this.browser.pages();
      const page = pages.find((p) => p.id() === pageId);

      if (!page) {
        return { success: false, error: 'Page not found' };
      }

      const screenshot = await page.screenshot({ encoding: 'base64' });
      logger.info('Screenshot captured');
      return { success: true, data: { image: screenshot, format: 'base64' } };
    } catch (error) {
      logger.error('Failed to capture screenshot', error);
      return { success: false, error: String(error) };
    }
  }

  async close(): Promise<BrowserResponse> {
    if (!this.browser) {
      return { success: false, error: 'Browser not running' };
    }

    try {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
      return { success: true, data: 'Browser instance closed' };
    } catch (error) {
      logger.error('Failed to close browser', error);
      return { success: false, error: String(error) };
    }
  }
}

export const browserService = new BrowserService();