import { describe, it, expect, vi, beforeEach } from 'vitest';
import webSearchModule from '../web-search.js';
import { registerModule, createMockContext } from './test-helpers.js';

describe('Web Search Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(webSearchModule.name).toBe('web-search');
    expect(webSearchModule.tools.length).toBe(1);
    expect(webSearchModule.tools[0].name).toBe('web_search');
  });

  it('should register the executor', () => {
    const registry = registerModule(webSearchModule);
    expect(registry.has('web_search')).toBe(true);
  });

  it('should have correct parameter definitions', () => {
    const tool = webSearchModule.tools[0];
    expect(tool.parameters).toHaveLength(2);
    expect(tool.parameters[0].name).toBe('query');
    expect(tool.parameters[0].required).toBe(true);
    expect(tool.parameters[1].name).toBe('max_results');
    expect(tool.parameters[1].required).toBe(false);
  });

  describe('web_search', () => {
    it('should fail when query is empty', async () => {
      const registry = registerModule(webSearchModule);
      const result = await registry.call('web_search', { query: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should mention Google/Serper or DuckDuckGo in description', () => {
      const tool = webSearchModule.tools[0];
      expect(tool.description).toMatch(/Google|Serper|DuckDuckGo/i);
    });
  });
});

describe('Serper Adapter', () => {
  it('should export expected functions', async () => {
    const serper = await import('../../capabilities/skills/web-search/adapters/serper.js');
    expect(typeof serper.isSerperAvailable).toBe('function');
    expect(typeof serper.serperSearch).toBe('function');
    expect(typeof serper.formatSerperResults).toBe('function');
    expect(typeof serper.getSerperApiKey).toBe('function');
  });

  it('isSerperAvailable should return false without API key', async () => {
    const { isSerperAvailable, setSerperApiKey } = await import('../../capabilities/skills/web-search/adapters/serper.js');
    setSerperApiKey(null);
    expect(isSerperAvailable()).toBe(false);
  });

  it('formatSerperResults should format results correctly', async () => {
    const { formatSerperResults } = await import('../../capabilities/skills/web-search/adapters/serper.js');

    const formatted = formatSerperResults('test query', [
      { title: 'Result 1', link: 'https://example.com/1', snippet: 'First result' },
      { title: 'Result 2', link: 'https://example.com/2', snippet: 'Second result' },
    ]);

    expect(formatted).toContain('test query');
    expect(formatted).toContain('Result 1');
    expect(formatted).toContain('https://example.com/1');
    expect(formatted).toContain('First result');
    expect(formatted).toContain('Result 2');
  });

  it('formatSerperResults should include answer box', async () => {
    const { formatSerperResults } = await import('../../capabilities/skills/web-search/adapters/serper.js');

    const formatted = formatSerperResults('what is pi', [], {
      answer: '3.14159',
      title: 'Pi',
      link: 'https://example.com',
    });

    expect(formatted).toContain('Quick Answer');
    expect(formatted).toContain('3.14159');
  });

  it('formatSerperResults should handle empty results', async () => {
    const { formatSerperResults } = await import('../../capabilities/skills/web-search/adapters/serper.js');
    const formatted = formatSerperResults('nothing', []);
    expect(formatted).toContain('No results');
  });
});
