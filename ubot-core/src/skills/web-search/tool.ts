/**
 * Web Search Tool
 * High-level function for the LLM tool executor.
 * Calls PuppeteerSearchAdapter and optionally deep-reads top results.
 */

import { puppeteerSearch } from './adapters/puppeteer.js';
import { extractContent } from './content-extractor.js';
import type { ToolExecutionResult } from '../../agent/types.js';

export interface WebSearchToolArgs {
  query: string;
  max_results?: number;
  deep_read?: boolean;
}

/**
 * Execute a web search and return formatted results for the LLM.
 */
export async function executeWebSearch(args: WebSearchToolArgs): Promise<ToolExecutionResult> {
  const query = args.query?.trim();
  if (!query) {
    return { toolName: 'web_search', success: false, error: 'Missing "query" parameter', duration: 0 };
  }

  const maxResults = args.max_results ?? 5;
  const deepRead = args.deep_read ?? false;
  const start = Date.now();

  try {
    console.log(`[WebSearch] Searching: "${query}" (max=${maxResults}, deepRead=${deepRead})`);
    const results = await puppeteerSearch(query, { maxResults });

    if (results.length === 0) {
      return {
        toolName: 'web_search',
        success: true,
        result: `No results found for "${query}".`,
        duration: Date.now() - start,
      };
    }

    // Format basic results
    const lines = results.map((r, i) =>
      `${i + 1}. **${r.title}**\n   ${r.snippet}\n   URL: ${r.url}`
    );

    // Optional: deep-read top results
    if (deepRead) {
      const deepReadCount = Math.min(2, results.length);
      for (let i = 0; i < deepReadCount; i++) {
        try {
          console.log(`[WebSearch] Deep-reading: ${results[i].url}`);
          const content = await extractContent(results[i].url);
          lines[i] += `\n   --- Extracted Content (${content.wordCount} words) ---\n   ${content.text.slice(0, 2000)}`;
        } catch (err) {
          lines[i] += `\n   (could not extract content: ${err instanceof Error ? err.message : 'unknown error'})`;
        }
      }
    }

    const formatted = `Found ${results.length} result(s) for "${query}":\n\n${lines.join('\n\n')}`;

    return {
      toolName: 'web_search',
      success: true,
      result: formatted,
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      toolName: 'web_search',
      success: false,
      error: `Web search failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      duration: Date.now() - start,
    };
  }
}
