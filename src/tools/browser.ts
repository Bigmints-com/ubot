/**
 * Browser Tool Module
 *
 * Tools for browser automation — browsing, clicking, typing, reading pages,
 * screenshots, and browser-based Gmail/Calendar reading.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';

const BROWSER_TOOLS: ToolDefinition[] = [
  {
    name: 'browse_url',
    description: 'Open a URL in the browser and return the page title and visible text content.',
    parameters: [
      { name: 'url', type: 'string', description: 'Full URL to navigate to (e.g. https://mail.google.com)', required: true },
    ],
  },
  {
    name: 'browser_click',
    description: 'Click an element on the current browser page using a CSS selector',
    parameters: [
      { name: 'selector', type: 'string', description: 'CSS selector of the element to click', required: true },
    ],
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field on the current browser page',
    parameters: [
      { name: 'selector', type: 'string', description: 'CSS selector of the input field', required: true },
      { name: 'text', type: 'string', description: 'Text to type into the field', required: true },
    ],
  },
  {
    name: 'browser_read_page',
    description: 'Read the visible text content from the current browser page, or from a specific element.',
    parameters: [
      { name: 'selector', type: 'string', description: 'Optional CSS selector to read text from a specific element.', required: false },
    ],
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current browser page. Returns a base64-encoded image.',
    parameters: [],
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the current browser page up or down.',
    parameters: [
      { name: 'direction', type: 'string', description: 'Scroll direction: "up" or "down" (default: "down")', required: false },
      { name: 'amount', type: 'number', description: 'Pixels to scroll (default: 500)', required: false },
    ],
  },
  {
    name: 'read_emails',
    description: 'Read emails from Gmail inbox. Uses Gmail API if Google is connected, otherwise falls back to the browser.',
    parameters: [
      { name: 'query', type: 'string', description: 'Gmail search query. Default: recent inbox.', required: false },
      { name: 'max_results', type: 'number', description: 'Max emails to return (default 15)', required: false },
    ],
  },
  {
    name: 'read_calendar',
    description: 'Read events from Google Calendar for a specific day. Uses Calendar API if Google is connected, otherwise falls back to the browser.',
    parameters: [
      { name: 'date', type: 'string', description: 'Date to check (e.g. "today", "tomorrow", "2026-02-20"). Default: today.', required: false },
    ],
  },
];

const browserToolModule: ToolModule = {
  name: 'browser',
  tools: BROWSER_TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {
    const lazyBrowser = async () => {
      const { getBrowserSkill } = await import('../capabilities/browser/skill.js');
      return getBrowserSkill();
    };

    const browserTool = (name: string, fn: (browser: any, args: Record<string, unknown>) => Promise<any>) => {
      registry.register(name, async (args) => {
        const browser = await lazyBrowser();
        const result = await fn(browser, args);
        return { toolName: name, success: result.success, result: result.data || '', error: result.error, duration: 0 };
      });
    };

    browserTool('browse_url', async (browser, args) => {
      const url = String(args.url || '');
      if (!url) return { success: false, error: 'Missing "url" parameter' };
      return browser.navigate(url);
    });

    browserTool('browser_click', async (browser, args) => {
      const selector = String(args.selector || '');
      if (!selector) return { success: false, error: 'Missing "selector" parameter' };
      return browser.click(selector);
    });

    browserTool('browser_type', async (browser, args) => {
      const selector = String(args.selector || '');
      const text = String(args.text || '');
      if (!selector || !text) return { success: false, error: 'Missing "selector" or "text" parameter' };
      return browser.type(selector, text);
    });

    browserTool('browser_read_page', async (browser, args) => {
      const selector = args.selector ? String(args.selector) : undefined;
      return browser.readPage(selector);
    });

    browserTool('browser_screenshot', async (browser) => {
      const result = await browser.screenshot();
      return { ...result, data: result.success ? 'Screenshot captured (base64 image)' : '' };
    });

    browserTool('browser_scroll', async (browser, args) => {
      const direction = (args.direction === 'up' ? 'up' : 'down') as 'up' | 'down';
      const amount = args.amount ? Number(args.amount) : 500;
      return browser.scroll(direction, amount);
    });

    // read_emails — prefer Gmail API, fallback to browser
    registry.register('read_emails', async (args) => {
      try {
        const { getGoogleAuthClient } = await import('../channels/google/auth.js');
        const auth = await getGoogleAuthClient();
        if (auth) {
          const { gmailList } = await import('../channels/google/gmail.js');
          const result = await gmailList(auth, {
            query: args.query ? String(args.query) : undefined,
            maxResults: args.max_results ? Number(args.max_results) : undefined,
          });
          return { toolName: 'read_emails', success: true, result, duration: 0 };
        }
      } catch {}
      // Fallback to browser
      const browser = await lazyBrowser();
      const result = await browser.readGmail({ query: args.query ? String(args.query) : undefined, maxEmails: args.max_results ? Number(args.max_results) : undefined });
      return { toolName: 'read_emails', success: result.success, result: result.data || '', error: result.error, duration: 0 };
    });

    // read_calendar — prefer Calendar API, fallback to browser
    registry.register('read_calendar', async (args) => {
      try {
        const { getGoogleAuthClient } = await import('../channels/google/auth.js');
        const auth = await getGoogleAuthClient();
        if (auth) {
          const { calendarListEvents } = await import('../channels/google/calendar.js');
          const result = await calendarListEvents(auth, {
            date: args.date ? String(args.date) : undefined,
            maxResults: 15,
          });
          return { toolName: 'read_calendar', success: true, result, duration: 0 };
        }
      } catch {}
      // Fallback to browser
      const browser = await lazyBrowser();
      const result = await browser.readCalendar({ date: args.date ? String(args.date) : undefined });
      return { toolName: 'read_calendar', success: result.success, result: result.data || '', error: result.error, duration: 0 };
    });
  },
};

export default browserToolModule;
