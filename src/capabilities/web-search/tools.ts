/**
 * Web Search Tool Module
 *
 * Priority chain:
 *   1. Serper.dev (Google SERP API) — if SERPER_API_KEY is set
 *   2. duck-duck-scrape — free, no API key needed
 *   3. Puppeteer-based search — heavyweight fallback
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../../tools/types.js';

const WEB_SEARCH_TOOLS: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the web for information. Returns titles, links, and snippets from Google (via Serper) or DuckDuckGo.',
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

      // ── 1. Serper.dev (Google SERP API) ──
      try {
        const { isSerperAvailable, serperSearch, formatSerperResults } = await import(
          './adapters/serper.js'
        );
        if (isSerperAvailable()) {
          const { results, answerBox, knowledgeGraph } = await serperSearch(query, { count: maxResults });
          const formatted = formatSerperResults(query, results.slice(0, maxResults), answerBox, knowledgeGraph);
          return { toolName: 'web_search', success: true, result: formatted, duration: 0 };
        }
      } catch (err: any) {
        console.error(`[web_search] Serper failed, falling back: ${err.message}`);
      }

      // ── 2. duck-duck-scrape (free, no API key) ──
      try {
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
      } catch (err: any) {
        console.error(`[web_search] DuckDuckGo failed, falling back: ${err.message}`);
      }

      // ── 3. Puppeteer-based search (heavyweight fallback) ──
      try {
        const { executeWebSearch } = await import('./tool.js');
        return executeWebSearch({ query, max_results: maxResults, deep_read: false });
      } catch (err: any) {
        return { toolName: 'web_search', success: false, error: `All search methods failed. Last error: ${err.message}`, duration: 0 };
      }
    });
  },
};

export default webSearchToolModule;
