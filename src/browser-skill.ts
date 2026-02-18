import puppeteer, { Browser, Page } from 'puppeteer';
import { join } from 'path';

export interface BrowserSkillConfig {
  headless?: boolean;
  defaultTimeout?: number;
  viewport?: { width: number; height: number };
}

export interface BrowserActionResult {
  success: boolean;
  data?: string;
  error?: string;
  url?: string;
  title?: string;
}

/**
 * Browser Capability
 * Provides browser automation via Puppeteer.
 * Lazily initializes — the browser is only launched on first use.
 */
export class BrowserSkill {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: Required<BrowserSkillConfig>;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimeoutMs = 5 * 60 * 1000; // 5 min

  constructor(config: BrowserSkillConfig = {}) {
    this.config = {
      headless: config.headless ?? false, // visible by default (user can see Gmail etc.)
      defaultTimeout: config.defaultTimeout ?? 30000,
      viewport: config.viewport ?? { width: 1280, height: 800 },
    };
  }

  /** Ensure the browser is running — lazy init */
  private async ensureBrowser(): Promise<Page> {
    this.resetIdleTimer();
    if (!this.browser || !this.page) {
      // Use system Chrome to avoid Google's automated browser blocks
      const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      const userDataDir = join(process.cwd(), 'browser-profile');
      console.log(`[Browser] 🚀 Launching Chrome (headless=${this.config.headless})...`);
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        executablePath: chromePath,
        userDataDir, // Dedicated profile — persists login sessions
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-blink-features=AutomationControlled',
        ],
      });
      this.page = await this.browser.newPage();
      await this.page.setViewport(this.config.viewport);
      this.page.setDefaultTimeout(this.config.defaultTimeout);
      console.log('[Browser] ✅ Ready');
    }
    return this.page;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      console.log('[Browser] 💤 Idle timeout — closing');
      this.close();
    }, this.idleTimeoutMs);
  }

  async navigate(url: string): Promise<BrowserActionResult> {
    try {
      const page = await this.ensureBrowser();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.config.defaultTimeout });
      const title = await page.title();
      const text = await this.getPageText(page);
      return {
        success: true,
        url: page.url(),
        title,
        data: `Page: ${title}\nURL: ${page.url()}\n\n${text}`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Navigation failed' };
    }
  }

  async click(selector: string): Promise<BrowserActionResult> {
    try {
      const page = await this.ensureBrowser();
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector);
      await page.waitForNetworkIdle({ timeout: 3000 }).catch(() => {}); // wait briefly for page update
      const title = await page.title();
      return { success: true, title, url: page.url(), data: `Clicked "${selector}" — page: ${title}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Click failed' };
    }
  }

  async type(selector: string, text: string): Promise<BrowserActionResult> {
    try {
      const page = await this.ensureBrowser();
      await page.waitForSelector(selector, { timeout: 5000 });
      // Clear existing text first
      await page.click(selector, { count: 3 });
      await page.type(selector, text);
      return { success: true, data: `Typed "${text}" into "${selector}"` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Type failed' };
    }
  }

  async readPage(selector?: string): Promise<BrowserActionResult> {
    try {
      const page = await this.ensureBrowser();
      const title = await page.title();
      const url = page.url();

      let text: string;
      if (selector) {
        const element = await page.$(selector);
        if (!element) return { success: false, error: `Element not found: ${selector}` };
        text = await element.evaluate(el => el.textContent || '');
      } else {
        text = await this.getPageText(page);
      }

      return { success: true, title, url, data: text.slice(0, 5000) }; // cap at 5k chars
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Read failed' };
    }
  }

  async screenshot(): Promise<BrowserActionResult> {
    try {
      const page = await this.ensureBrowser();
      const buffer = await page.screenshot({ fullPage: false, encoding: 'base64' }) as string;
      return { success: true, data: `data:image/png;base64,${buffer}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Screenshot failed' };
    }
  }

  /** Extract readable text from page */
  private async getPageText(page: Page): Promise<string> {
    try {
      const text = await page.$eval('body', (body: any) => {
        // Remove scripts, styles, hidden elements
        body.querySelectorAll('script, style, noscript, svg, [hidden]').forEach((el: any) => el.remove());
        return (body.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
      });
      return text;
    } catch {
      return '(could not extract page text)';
    }
  }

  async close(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.browser) {
      console.log('[Browser] 🛑 Closing');
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  isRunning(): boolean {
    return this.browser !== null;
  }
}

let sharedInstance: BrowserSkill | null = null;

/** Get or create the shared browser instance */
export function getBrowserSkill(): BrowserSkill {
  if (!sharedInstance) {
    sharedInstance = new BrowserSkill();
  }
  return sharedInstance;
}