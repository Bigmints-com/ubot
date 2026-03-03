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
  {
    name: 'browser_snapshot',
    description: 'Capture a structured snapshot of the current page. "aria" mode returns the accessibility tree (roles, names, values). "interactive" mode returns only clickable/typeable elements with ref IDs for use with browser_click/browser_type.',
    parameters: [
      { name: 'mode', type: 'string', description: '"aria" (full accessibility tree) or "interactive" (clickable/typeable elements only). Default: "interactive"', required: false },
    ],
  },
];

const browserToolModule: ToolModule = {
  name: 'browser',
  tools: BROWSER_TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {
    const lazyBrowser = async () => {
      const { getBrowserService } = await import('../capabilities/browser/service.js');
      return getBrowserService();
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
        const { getGoogleAuthClient } = await import('../integrations/google/auth.js');
        const auth = await getGoogleAuthClient();
        if (auth) {
          const { gmailList } = await import('../integrations/google/gmail.js');
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
        const { getGoogleAuthClient } = await import('../integrations/google/auth.js');
        const auth = await getGoogleAuthClient();
        if (auth) {
          const { calendarListEvents } = await import('../integrations/google/calendar.js');
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

    // browser_snapshot — accessibility tree / interactive elements
    registry.register('browser_snapshot', async (args) => {
      const mode = (String(args.mode || 'interactive')).toLowerCase();
      const start = Date.now();

      try {
        const browser = await lazyBrowser();
        const page = await browser.getActivePage();

        if (mode === 'aria') {
          // Full accessibility tree
          const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
          if (!snapshot) {
            return { toolName: 'browser_snapshot', success: false, error: 'Accessibility tree is empty', duration: Date.now() - start };
          }

          const formatNode = (node: any, depth: number = 0): string => {
            const indent = '  '.repeat(depth);
            let line = `${indent}[${node.role}]`;
            if (node.name) line += ` "${node.name}"`;
            if (node.value) line += ` value="${node.value}"`;
            if (node.checked !== undefined) line += ` checked=${node.checked}`;
            if (node.selected !== undefined) line += ` selected=${node.selected}`;
            if (node.focused) line += ' *focused*';
            const lines = [line];
            if (node.children) {
              for (const child of node.children) {
                lines.push(formatNode(child, depth + 1));
              }
            }
            return lines.join('\n');
          };

          const treeText = formatNode(snapshot);
          return {
            toolName: 'browser_snapshot',
            success: true,
            result: `Page Accessibility Tree:\n\n${treeText}`,
            duration: Date.now() - start,
          };
        }

        // Interactive mode: extract clickable/typeable elements
        const elements = await page.evaluate(() => {
          const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="menuitem"], [onclick], [tabindex]';
          const els = document.querySelectorAll(interactiveSelectors);
          const results: Array<{ ref: number; tag: string; type?: string; role?: string; text: string; name?: string; id?: string; href?: string; value?: string; placeholder?: string }> = [];
          let ref = 1;
          els.forEach(el => {
            const rect = el.getBoundingClientRect();
            // Skip invisible elements
            if (rect.width === 0 || rect.height === 0) return;
            const text = (el.textContent || '').trim().slice(0, 100);
            const item: any = { ref: ref++, tag: el.tagName.toLowerCase() };
            if ((el as HTMLInputElement).type) item.type = (el as HTMLInputElement).type;
            if (el.getAttribute('role')) item.role = el.getAttribute('role');
            if (text) item.text = text;
            if (el.getAttribute('name')) item.name = el.getAttribute('name');
            if (el.id) item.id = el.id;
            if ((el as HTMLAnchorElement).href) item.href = (el as HTMLAnchorElement).href;
            if ((el as HTMLInputElement).value) item.value = (el as HTMLInputElement).value;
            if ((el as HTMLInputElement).placeholder) item.placeholder = (el as HTMLInputElement).placeholder;
            results.push(item);
          });
          return results;
        });

        if (elements.length === 0) {
          return {
            toolName: 'browser_snapshot',
            success: true,
            result: 'No interactive elements found on the page.',
            duration: Date.now() - start,
          };
        }

        const lines = elements.map((el: any) => {
          let line = `[${el.ref}] <${el.tag}`;
          if (el.type) line += ` type="${el.type}"`;
          if (el.role) line += ` role="${el.role}"`;
          if (el.id) line += ` id="${el.id}"`;
          if (el.name) line += ` name="${el.name}"`;
          line += '>';
          if (el.text) line += ` "${el.text}"`;
          if (el.value) line += ` value="${el.value}"`;
          if (el.placeholder) line += ` placeholder="${el.placeholder}"`;
          if (el.href) line += ` → ${el.href}`;
          return line;
        });

        return {
          toolName: 'browser_snapshot',
          success: true,
          result: `Interactive elements (${elements.length} found):\n\n${lines.join('\n')}\n\nUse browser_click with the element's CSS selector (e.g., #id or [name="..."] or tag:nth-of-type) to interact.`,
          duration: Date.now() - start,
        };
      } catch (err: any) {
        return { toolName: 'browser_snapshot', success: false, error: err.message, duration: Date.now() - start };
      }
    });
  },
};

export default browserToolModule;
