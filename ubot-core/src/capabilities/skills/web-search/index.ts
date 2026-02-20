/**
 * Web Search Skill
 * Main entry point for web search functionality
 */

import type { WebSearchConfig, WebSearchSkillOptions } from './types.js';
import { WEB_SEARCH_SKILL } from './types.js';
import {
  WebSearchService,
  createWebSearchService,
  getWebSearchService,
  resetWebSearchService,
} from './service.js';
import {
  generateSearchId,
  generateResultId,
  extractDomain,
  normalizeQuery,
  buildSearchUrl,
  calculateRelevanceScore,
  filterResults,
  sortResults,
  paginateResults,
  generateCacheKey,
  isCacheExpired,
  deduplicateResults,
  mergeResults,
  detectResultType,
  validateQuery,
  formatDuration,
  createDefaultStats,
} from './utils.js';

// Re-export types
export type {
  SearchEngine,
  SearchStatus,
  SearchResultType,
  SearchResultItem,
  SearchQueryOptions,
  SearchQuery,
  SearchResults,
  SearchFilter,
  SearchSortOptions,
  SearchListResult,
  ExtractedContent,
  SearchCacheEntry,
  WebSearchConfig,
  SearchStats,
  BatchSearchItem,
  BatchSearchResult,
  WebSearchSkillOptions,
} from './types.js';

export {
  WEB_SEARCH_SKILL,
  DEFAULT_WEB_SEARCH_CONFIG,
} from './types.js';

// Re-export service
export {
  WebSearchService,
  createWebSearchService,
  getWebSearchService,
  resetWebSearchService,
} from './service.js';

// Re-export utilities
export {
  generateSearchId,
  generateResultId,
  extractDomain,
  normalizeQuery,
  buildSearchUrl,
  calculateRelevanceScore,
  filterResults,
  sortResults,
  paginateResults,
  generateCacheKey,
  isCacheExpired,
  deduplicateResults,
  mergeResults,
  detectResultType,
  validateQuery,
  formatDuration,
  createDefaultStats,
} from './utils.js';

// Re-export adapter, content extractor, and tool
export { puppeteerSearch } from './adapters/puppeteer.js';
export { extractContent } from './content-extractor.js';
export { executeWebSearch } from './tool.js';

/**
 * Initialize the web search skill
 */
export function initializeWebSearch(
  options?: WebSearchSkillOptions
): WebSearchService {
  const service = createWebSearchService(options?.config);
  return service;
}

/**
 * Get the web search service instance
 */
export function getWebSearch(): WebSearchService {
  return getWebSearchService();
}

/**
 * Reset the web search service
 */
export function resetWebSearch(): void {
  resetWebSearchService();
}

/**
 * Quick search helper
 */
export async function quickSearch(
  query: string,
  maxResults?: number
): Promise<import('./types.js').SearchResults> {
  const service = getWebSearchService();
  return service.search(query, { maxResults });
}

/**
 * Web Search Skill export
 */
export const WebSearchSkill = {
  id: WEB_SEARCH_SKILL.id,
  name: WEB_SEARCH_SKILL.name,
  description: WEB_SEARCH_SKILL.description,
  initialize: initializeWebSearch,
  getService: getWebSearch,
  reset: resetWebSearch,
  quickSearch,
};

export default WebSearchSkill;