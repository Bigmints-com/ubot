import puppeteer, { Browser, Page } from 'puppeteer';

export interface BrowserSkillConfig {
  headless?: boolean;
  defaultTimeout?: number;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface BrowserActionResult {
  success: boolean;
  data?: string | Buffer | object;
  error?: string;
  url?: string;
  title?: string;
}

export class BrowserSkill {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: Required<BrowserSkillConfig>;

  constructor(config: BrowserSkillConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      defaultTimeout: config.defaultTimeout ?? 30000,
      viewport: config.viewport ?? { width: 1280, height: 720 }
    };
  }

  async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: this.config.headless
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport(this.config.viewport);
    this.page.setDefaultTimeout(this.config.defaultTimeout);
  }

  async navigate(url: string): Promise<BrowserActionResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      await this.page.goto(url, { waitUntil: 'networkidle0' });
      const title = await this.page.title();
      return {
        success: true,
        url: this.page.url(),
        title
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Navigation failed'
      };
    }
  }

  async screenshot(selector?: string): Promise<BrowserActionResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      let buffer: Buffer;
      
      if (selector) {
        const element = await this.page.$(selector);
        if (!element) {
          return { success: false, error: `Element not found: ${selector}` };
        }
        buffer = await element.screenshot() as Buffer;
      } else {
        buffer = await this.page.screenshot({ fullPage: true }) as Buffer;
      }

      return { success: true, data: buffer };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Screenshot failed'
      };
    }
  }

  async click(selector: string): Promise<BrowserActionResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      await this.page.click(selector);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Click failed'
      };
    }
  }

  async type(selector: string, text: string): Promise<BrowserActionResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      await this.page.type(selector, text);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Type failed'
      };
    }
  }

  async evaluate<T>(fn: () => T): Promise<BrowserActionResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      const result = await this.page.evaluate(fn);
      return { success: true, data: result as object };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Evaluation failed'
      };
    }
  }

  async getText(selector: string): Promise<BrowserActionResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      const element = await this.page.$(selector);
      if (!element) {
        return { success: false, error: `Element not found: ${selector}` };
      }
      const text = await element.evaluate(el => el.textContent || '');
      return { success: true, data: text };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Get text failed'
      };
    }
  }

  async waitForSelector(selector: string, timeout?: number): Promise<BrowserActionResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      await this.page.waitForSelector(selector, { timeout: timeout ?? this.config.defaultTimeout });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Wait for selector failed'
      };
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getPage(): Page | null {
    return this.page;
  }
}