import puppeteer, { Browser, Page } from 'puppeteer';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { log } from '../../logger/ring-buffer.js';

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

  /** Known fatal errors that can be self-healed by restarting the browser */
  private static FATAL_PATTERNS = [
    'detached Frame',
    'already running',
    'Target closed',
    'Session closed',
    'Protocol error',
    'Connection closed',
    'browser has disconnected',
  ];

  private isFatalError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return BrowserSkill.FATAL_PATTERNS.some(p => msg.includes(p));
  }

  /** Remove lock files and kill orphaned Chrome processes for our profile */
  private forceCleanup(): void {
    const userDataDir = join(process.cwd(), 'browser-profile');
    const lockFile = join(userDataDir, 'SingletonLock');
    if (existsSync(lockFile)) {
      try { unlinkSync(lockFile); } catch {}
      log.warn('Browser', 'Removed stale SingletonLock');
    }
    // Kill any chrome processes using our profile
    try {
      execSync(`pkill -f "chrome.*browser-profile" 2>/dev/null || true`, { stdio: 'ignore' });
    } catch {}
  }

  /**
   * Self-healing wrapper — runs a browser action; on fatal error,
   * closes the browser, cleans up, and retries once.
   */
  private async withRecovery(action: () => Promise<BrowserActionResult>): Promise<BrowserActionResult> {
    try {
      return await action();
    } catch (err) {
      if (this.isFatalError(err)) {
        log.warn('Browser', `Self-healing: ${err instanceof Error ? err.message : err}`);
        await this.close();
        this.forceCleanup();
        // Retry once
        try {
          return await action();
        } catch (retryErr) {
          log.error('Browser', `Retry failed: ${retryErr instanceof Error ? retryErr.message : retryErr}`);
          return { success: false, error: `Recovery failed: ${retryErr instanceof Error ? retryErr.message : 'Unknown error'}` };
        }
      }
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /** Ensure the browser is running — lazy init with self-healing */
  private async ensureBrowser(): Promise<Page> {
    this.resetIdleTimer();

    // If browser exists but is disconnected, clean up and re-launch
    if (this.browser && !this.browser.isConnected()) {
      log.warn('Browser', 'Connection lost — re-launching');
      this.browser = null;
      this.page = null;
    }

    if (!this.browser || !this.page) {
      this.forceCleanup();
      const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      const userDataDir = join(process.cwd(), 'browser-profile');
      log.info('Browser', `Launching Chrome (headless=${this.config.headless})...`);
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        executablePath: chromePath,
        userDataDir,
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-blink-features=AutomationControlled',
        ],
      });
      this.page = await this.browser.newPage();
      await this.page.setViewport(this.config.viewport);
      this.page.setDefaultTimeout(this.config.defaultTimeout);
      log.info('Browser', 'Ready');
    }
    return this.page;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      log.info('Browser', 'Idle timeout — closing');
      this.close();
    }, this.idleTimeoutMs);
  }

  async navigate(url: string): Promise<BrowserActionResult> {
    return this.withRecovery(async () => {
      const page = await this.ensureBrowser();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.config.defaultTimeout });
      await this.dismissPopups(page);
      await this.autoScroll(page);
      const title = await page.title();
      const text = await this.getPageText(page);
      return {
        success: true,
        url: page.url(),
        title,
        data: `Page: ${title}\nURL: ${page.url()}\n\n${text}`,
      };
    });
  }

  async click(selector: string): Promise<BrowserActionResult> {
    return this.withRecovery(async () => {
      const page = await this.ensureBrowser();
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector);
      await page.waitForNetworkIdle({ timeout: 3000 }).catch(() => {});
      const title = await page.title();
      return { success: true, title, url: page.url(), data: `Clicked "${selector}" — page: ${title}` };
    });
  }

  async type(selector: string, text: string): Promise<BrowserActionResult> {
    return this.withRecovery(async () => {
      const page = await this.ensureBrowser();
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector, { count: 3 });
      await page.type(selector, text);
      return { success: true, data: `Typed "${text}" into "${selector}"` };
    });
  }

  async readPage(selector?: string): Promise<BrowserActionResult> {
    return this.withRecovery(async () => {
      const page = await this.ensureBrowser();
      await this.dismissPopups(page);
      const title = await page.title();
      const url = page.url();

      let text: string;
      if (selector) {
        const element = await page.$(selector);
        if (!element) return { success: false, error: `Element not found: ${selector}` };
        text = await element.evaluate(el => el.textContent || '');
      } else {
        await this.autoScroll(page);
        text = await this.getPageText(page);
      }

      return { success: true, title, url, data: text.slice(0, 5000) };
    });
  }

  async screenshot(): Promise<BrowserActionResult> {
    return this.withRecovery(async () => {
      const page = await this.ensureBrowser();
      const buffer = await page.screenshot({ fullPage: false, encoding: 'base64' }) as string;
      return { success: true, data: `data:image/png;base64,${buffer}` };
    });
  }

  /**
   * Dismiss common popups: cookie banners, consent dialogs, newsletter overlays, etc.
   * Tries multiple strategies: clicking common buttons, pressing Escape, removing overlays.
   */
  private async dismissPopups(page: Page): Promise<void> {
    try {
      // Common "accept" / "close" / "dismiss" button selectors
      const popupSelectors = [
        // Cookie / consent banners
        '[id="L2AGLb"]',                         // Google consent
        '[aria-label="Accept all"]',
        '[aria-label="Accept cookies"]',
        'button[id*="accept"]',
        'button[id*="consent"]',
        'button[class*="accept"]',
        'button[class*="consent"]',
        'button[class*="cookie"] ',
        'a[class*="accept"]',
        '[data-testid="cookie-policy-manage-dialog-btn-accept"]',
        '.cookie-banner button',
        '.cookie-notice button',
        '#cookie-banner button',
        '.gdpr button',
        '#gdpr-consent button',
        '#onetrust-accept-btn-handler',
        '.cc-btn.cc-dismiss',
        // Generic close / dismiss buttons
        '[aria-label="Close"]',
        '[aria-label="Dismiss"]',
        'button.close',
        '.modal .close',
        '.overlay .close',
        '[class*="popup"] [class*="close"]',
        '[class*="modal"] [class*="close"]',
        '[class*="banner"] [class*="close"]',
      ];

      for (const sel of popupSelectors) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            const isVisible = await btn.evaluate((el: any) => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            });
            if (isVisible) {
              await btn.click();
              console.log(`[Browser] 🚫 Dismissed popup via: ${sel}`);
              await new Promise(r => setTimeout(r, 500));
            }
          }
        } catch {
          // Selector didn't match or click failed — continue
        }
      }

      // Press Escape to close any remaining modal/overlay
      await page.keyboard.press('Escape').catch(() => {});

      // Remove fixed/sticky overlays that block content
      await page.evaluate(() => {
        document.querySelectorAll('*').forEach((el: any) => {
          const style = window.getComputedStyle(el);
          if ((style.position === 'fixed' || style.position === 'sticky') && style.zIndex !== 'auto') {
            const z = parseInt(style.zIndex, 10);
            // High z-index elements covering the viewport are likely overlays
            if (z > 900 && el.offsetHeight > 100) {
              el.remove();
            }
          }
        });
      }).catch(() => {});
    } catch {
      // Best-effort — don't fail navigation over popups
    }
  }

  /**
   * Scroll down the page incrementally to trigger lazy-loading content.
   * Scrolls until no new content loads or a max number of scrolls is reached.
   */
  private async autoScroll(page: Page, maxScrolls = 3): Promise<void> {
    try {
      await page.evaluate(async (max) => {
        await new Promise<void>((resolve) => {
          let scrolls = 0;
          let lastHeight = document.body.scrollHeight;

          const timer = setInterval(() => {
            window.scrollBy(0, window.innerHeight * 0.8);
            scrolls++;

            const newHeight = document.body.scrollHeight;
            if (scrolls >= max || newHeight === lastHeight) {
              clearInterval(timer);
              // Scroll back to top so the user sees full content
              window.scrollTo(0, 0);
              resolve();
            }
            lastHeight = newHeight;
          }, 400);
        });
      }, maxScrolls);
    } catch {
      // Best-effort
    }
  }

  /** Public: scroll the page by a specific amount or to an element */
  async scroll(direction: 'up' | 'down' = 'down', amount = 500): Promise<BrowserActionResult> {
    return this.withRecovery(async () => {
      const page = await this.ensureBrowser();
      const delta = direction === 'down' ? amount : -amount;
      await page.evaluate((d) => window.scrollBy(0, d), delta);
      await new Promise(r => setTimeout(r, 300));
      return { success: true, data: `Scrolled ${direction} by ${amount}px` };
    });
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

  /** Read emails from Gmail inbox using Puppeteer */
  async readGmail(options?: { query?: string; maxEmails?: number }): Promise<BrowserActionResult> {
    return this.withRecovery(async () => {
      const maxEmails = options?.maxEmails ?? 15;
      const page = await this.ensureBrowser();
      
      const searchQuery = options?.query || '';
      const gmailUrl = searchQuery
        ? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(searchQuery)}`
        : 'https://mail.google.com/mail/u/0/#inbox';
      
      await page.goto(gmailUrl, { waitUntil: 'networkidle2', timeout: this.config.defaultTimeout });
      
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
        return {
          success: false,
          error: 'Not logged into Gmail. Please open Chrome manually and log into your Google account first.',
        };
      }
      
      try {
        await page.waitForSelector('tr.zA, div[role="main"] table tr', { timeout: 10000 });
      } catch {
        const bodyText = await this.getPageText(page);
        if (bodyText.includes('No new mail') || bodyText.includes('Your Primary tab is empty')) {
          return { success: true, data: JSON.stringify({ emails: [], message: 'Inbox is empty' }) };
        }
        return { success: true, data: `Gmail loaded but could not parse emails. Page content:\n${bodyText.slice(0, 3000)}` };
      }
      
      const emails = await page.evaluate((max) => {
        const rows = (document as any).querySelectorAll('tr.zA');
        const results: any[] = [];
        for (let i = 0; i < Math.min(rows.length, max); i++) {
          const row = rows[i] as any;
          const unread = row.classList.contains('zE');
          const senderEl = row.querySelector('.yW span[email], .yW .bA4, .yW span, td.yX span') as any;
          const sender = senderEl?.getAttribute('email') || senderEl?.textContent?.trim() || '';
          const subjectEl = row.querySelector('.bog span, .y2') as any;
          const subject = subjectEl?.textContent?.trim() || '';
          const snippetEl = row.querySelector('.y2 .y2') as any;
          const snippet = snippetEl?.textContent?.trim().replace(/^\s*-\s*/, '') || '';
          const dateEl = row.querySelector('.xW span, td.xW span') as any;
          const date = dateEl?.getAttribute('title') || dateEl?.textContent?.trim() || '';
          if (sender || subject) results.push({ sender, subject, snippet, date, unread });
        }
        return results;
      }, maxEmails);
      
      const summary = emails.map((e, i) => {
        const flag = e.unread ? '📬' : '📭';
        return `${flag} ${i + 1}. **${e.sender}** — ${e.subject}${e.snippet ? ` (${e.snippet})` : ''} — ${e.date}`;
      }).join('\n');
      
      return {
        success: true,
        data: `Found ${emails.length} email(s)${searchQuery ? ` matching "${searchQuery}"` : ' in inbox'}:\n\n${summary}\n\n---\nRaw data: ${JSON.stringify(emails)}`,
      };
    });
  }

  /** Read events from Google Calendar using Puppeteer */
  async readCalendar(options?: { date?: string }): Promise<BrowserActionResult> {
    return this.withRecovery(async () => {
      const page = await this.ensureBrowser();
      let calendarUrl = 'https://calendar.google.com/calendar/r/day';
      
      if (options?.date && options.date !== 'today') {
        let targetDate: Date;
        const dateStr = options.date.toLowerCase();
        if (dateStr === 'tomorrow') {
          targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + 1);
        } else {
          targetDate = new Date(options.date);
        }
        if (!isNaN(targetDate.getTime())) {
          const y = targetDate.getFullYear();
          const m = targetDate.getMonth() + 1;
          const d = targetDate.getDate();
          calendarUrl = `https://calendar.google.com/calendar/r/day/${y}/${m}/${d}`;
        }
      }
      
      await page.goto(calendarUrl, { waitUntil: 'networkidle2', timeout: this.config.defaultTimeout });
      
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
        return {
          success: false,
          error: 'Not logged into Google Calendar. Please open Chrome manually and log into your Google account first.',
        };
      }
      
      await new Promise(r => setTimeout(r, 2000));
      
      const events = await page.evaluate(() => {
        const results: any[] = [];
        const eventEls = (document as any).querySelectorAll(
          '[data-eventid], [data-eventchip], div[data-eventchip] span, .FAxxKc, .WBi6vc, .NlL62b, .gVNoLb'
        );
        eventEls.forEach((el: any) => {
          const title = el.getAttribute('aria-label') || el.textContent?.trim() || '';
          if (title && title.length > 1) {
            const timeMatch = title.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*[–-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);
            const time = timeMatch ? timeMatch[1] : '';
            const cleanTitle = title.replace(timeMatch?.[0] || '', '').replace(/^[,\s]+|[,\s]+$/g, '').trim();
            if (cleanTitle && !results.some((r: any) => r.title === cleanTitle)) {
              results.push({ title: cleanTitle, time, location: '' });
            }
          }
        });
        
        if (results.length === 0) {
          const mainContent = (document as any).querySelector('[data-view-heading], [role="main"]');
          if (mainContent) {
            const text = mainContent.textContent || '';
            const lines = text.split('\n').filter((l: any) => l.trim());
            for (const line of lines) {
              const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
              if (timeMatch) {
                const evTitle = line.replace(timeMatch[0], '').trim();
                if (evTitle && !results.some((r: any) => r.title === evTitle)) {
                  results.push({ title: evTitle, time: timeMatch[1], location: '' });
                }
              }
            }
          }
        }
        return results;
      });
      
      if (events.length === 0) {
        const bodyText = await this.getPageText(page);
        const dateInfo = options?.date || 'today';
        return {
          success: true,
          data: `No structured events found for ${dateInfo}. Calendar page content:\n${bodyText.slice(0, 3000)}`,
        };
      }
      
      const dateInfo = options?.date || 'today';
      const summary = events.map((e, i) => {
        return `📅 ${i + 1}. **${e.title}**${e.time ? ` — ${e.time}` : ''}${e.location ? ` @ ${e.location}` : ''}`;
      }).join('\n');
      
      return {
        success: true,
        data: `Found ${events.length} event(s) for ${dateInfo}:\n\n${summary}\n\n---\nRaw data: ${JSON.stringify(events)}`,
      };
    });
  }

  async close(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.browser) {
      log.info('Browser', 'Closing');
      try {
        await this.browser.close();
      } catch {
        // Force-kill even if close() fails
      }
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