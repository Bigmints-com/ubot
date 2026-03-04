/**
 * Web Search Capability
 * Main entry point for web search functionality.
 */
import type { ToolModule } from '../../tools/types.js';
import webSearchTools from './tools.js';
import webFetchTools from './fetch-tools.js';

/** Auto-discovered tool modules for this capability */
export const toolModules: ToolModule[] = [webSearchTools, webFetchTools];

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
  WebSearchConfig,
  SearchStats,
  BatchSearchItem,
  BatchSearchResult,
  WebSearchSkillOptions,
} from './types.js';

export { WEB_SEARCH_SKILL } from './types.js';

// Re-export content extractor and tool
export { extractContent } from './content-extractor.js';
export { executeWebSearch } from './tool.js';