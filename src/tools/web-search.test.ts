import { describe, it, expect } from 'vitest';
import webSearchModule from './web-search.js';
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

  describe('web_search', () => {
    it('should fail when query is empty', async () => {
      const registry = registerModule(webSearchModule);
      const result = await registry.call('web_search', { query: '' });
      expect(result.success).toBe(false);
    });
  });
});
