import { describe, it, expect } from 'vitest';
import browserModule from './browser.js';
import { registerModule } from './test-helpers.js';

describe('Browser Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(browserModule.name).toBe('browser');
    expect(browserModule.tools.length).toBe(8);
    expect(browserModule.tools.map(t => t.name)).toEqual([
      'browse_url', 'browser_click', 'browser_type', 'browser_read_page',
      'browser_screenshot', 'browser_scroll', 'read_emails', 'read_calendar',
    ]);
  });

  it('should register all 8 executors', () => {
    const registry = registerModule(browserModule);
    expect(registry.registeredNames()).toHaveLength(8);
    expect(registry.has('browse_url')).toBe(true);
    expect(registry.has('browser_click')).toBe(true);
    expect(registry.has('browser_type')).toBe(true);
    expect(registry.has('browser_read_page')).toBe(true);
    expect(registry.has('browser_screenshot')).toBe(true);
    expect(registry.has('browser_scroll')).toBe(true);
    expect(registry.has('read_emails')).toBe(true);
    expect(registry.has('read_calendar')).toBe(true);
  });

  it('should have correct parameter definitions', () => {
    const browseUrl = browserModule.tools.find(t => t.name === 'browse_url');
    expect(browseUrl?.parameters).toHaveLength(1);
    expect(browseUrl?.parameters[0].name).toBe('url');
    expect(browseUrl?.parameters[0].required).toBe(true);

    const click = browserModule.tools.find(t => t.name === 'browser_click');
    expect(click?.parameters).toHaveLength(1);
    expect(click?.parameters[0].name).toBe('selector');

    const type = browserModule.tools.find(t => t.name === 'browser_type');
    expect(type?.parameters).toHaveLength(2);
  });

  // Note: Browser tools require Puppeteer (dynamic import) so we test definitions and registration only.
  // Execution tests would require mocking the BrowserService which is complex and fragile.
});
