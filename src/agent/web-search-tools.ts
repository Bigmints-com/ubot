/**
 * Web Search Tool Module
 *
 * Uses duck-duck-scrape for fast, browser-free web searching.
 * Fallback: delegates to the existing Puppeteer-based search if duck-duck-scrape fails.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';

const WEB_SEARCH_TOOLS: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the web for information using DuckDuckGo. Returns titles, links, and snippets.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'max_results', type: 'number', description: 'Max results to return (default 8)', required: false },
    ],
  },
];

const webSearchToolModule: ToolModule = {
  name: 'web-search',
  tools: WEB_SEARCH_TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {
    registry.register('web_search', async (args) => {
      const query = String(args.query || '');
      if (!query) return { toolName: 'web_search', success: false, error: 'Missing "query" parameter', duration: 0 };
      const maxResults = args.max_results ? Number(args.max_results) : 8;

      try {
        // Try duck-duck-scrape first (fast, no browser)
        const ddg = await import('duck-duck-scrape').catch(() => null);
        if (ddg) {
          const results = await ddg.search(query, { safeSearch: ddg.SafeSearchType.MODERATE });
          const items = (results.results || []).slice(0, maxResults);
          if (items.length === 0) {
            return { toolName: 'web_search', success: true, result: `No results found for "${query}".`, duration: 0 };
          }
          const formatted = items.map((r: any, i: number) =>
            `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description || ''}`
          ).join('\n\n');
          return { toolName: 'web_search', success: true, result: `Search results for "${query}":\n\n${formatted}`, duration: 0 };
        }

        // Fallback: Puppeteer-based search
        const { executeWebSearch } = await import('../skills/web-search/tool.js');
        return executeWebSearch({
          query,
          max_results: maxResults,
          deep_read: false,
        });
      } catch (err: any) {
        // Final fallback
        try {
          const { executeWebSearch } = await import('../skills/web-search/tool.js');
          return executeWebSearch({ query, max_results: maxResults, deep_read: false });
        } catch (fallbackErr: any) {
          return { toolName: 'web_search', success: false, error: `Search failed: ${err.message}`, duration: 0 };
        }
      }
    });
  },
};

export default webSearchToolModule;
