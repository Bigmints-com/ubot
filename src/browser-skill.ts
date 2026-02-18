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

  /** Read emails from Gmail inbox using Puppeteer */
  async readGmail(options?: { query?: string; maxEmails?: number }): Promise<BrowserActionResult> {
    const maxEmails = options?.maxEmails ?? 15;
    try {
      const page = await this.ensureBrowser();
      
      // Navigate to Gmail (with optional search query)
      const searchQuery = options?.query || '';
      const gmailUrl = searchQuery
        ? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(searchQuery)}`
        : 'https://mail.google.com/mail/u/0/#inbox';
      
      await page.goto(gmailUrl, { waitUntil: 'networkidle2', timeout: this.config.defaultTimeout });
      
      // Check if we're on a login page (not logged in)
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
        return {
          success: false,
          error: 'Not logged into Gmail. Please open Chrome manually and log into your Google account first. The browser profile at ./browser-profile/ will remember the session.',
        };
      }
      
      // Wait for inbox rows to appear
      // Gmail uses various selectors — try common ones
      try {
        await page.waitForSelector('tr.zA, div[role="main"] table tr', { timeout: 10000 });
      } catch {
        // Maybe the inbox is empty or selectors changed
        const bodyText = await this.getPageText(page);
        if (bodyText.includes('No new mail') || bodyText.includes('Your Primary tab is empty')) {
          return { success: true, data: JSON.stringify({ emails: [], message: 'Inbox is empty' }) };
        }
        // Return whatever text we can read
        return { success: true, data: `Gmail loaded but could not parse emails. Page content:\n${bodyText.slice(0, 3000)}` };
      }
      
      // Extract email data from visible rows
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
          
          if (sender || subject) {
            results.push({ sender, subject, snippet, date, unread });
          }
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
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to read Gmail' };
    }
  }

  /** Read events from Google Calendar using Puppeteer */
  async readCalendar(options?: { date?: string }): Promise<BrowserActionResult> {
    try {
      const page = await this.ensureBrowser();
      
      // Navigate to Calendar day view
      let calendarUrl = 'https://calendar.google.com/calendar/r/day';
      
      // If a specific date is provided, append it
      if (options?.date && options.date !== 'today') {
        // Parse the date — support "tomorrow", ISO strings, etc.
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
      
      // Check if we're on a login page
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
        return {
          success: false,
          error: 'Not logged into Google Calendar. Please open Chrome manually and log into your Google account first.',
        };
      }
      
      // Wait for calendar to render
      await new Promise(r => setTimeout(r, 2000)); // Extra wait for Calendar JS rendering
      
      // Extract event data from the day view
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
        // Fallback: just read the page text
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
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to read Calendar' };
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