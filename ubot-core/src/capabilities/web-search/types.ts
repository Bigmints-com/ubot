/**
 * Web Search Skill Types
 * Defines types for web search capabilities
 */

/**
 * Search engine providers
 */
export type SearchEngine = 'google' | 'bing' | 'duckduckgo' | 'custom';

/**
 * Search result status
 */
export type SearchStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Search result type
 */
export type SearchResultType = 'web' | 'image' | 'video' | 'news' | 'academic' | 'social';

/**
 * Individual search result item
 */
export interface SearchResultItem {
  /** Unique identifier for the result */
  id: string;
  /** Result title */
  title: string;
  /** Result URL */
  url: string;
  /** Result snippet/description */
  snippet: string;
  /** Type of result */
  type: SearchResultType;
  /** Source domain */
  domain: string;
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Position in results */
  position: number;
  /** When the page was published (if available) */
  publishedDate?: Date;
  /** When the result was retrieved */
  retrievedAt: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Search query options
 */
export interface SearchQueryOptions {
  /** Search engine to use */
  engine?: SearchEngine;
  /** Maximum number of results */
  maxResults?: number;
  /** Result offset for pagination */
  offset?: number;
  /** Filter by result type */
  type?: SearchResultType;
  /** Date range filter */
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  /** Language code */
  language?: string;
  /** Country code for localization */
  country?: string;
  /** Safe search setting */
  safeSearch?: boolean;
  /** Include full content extraction */
  extractContent?: boolean;
  /** Custom search engine URL (for custom engine) */
  customEngineUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Search query
 */
export interface SearchQuery {
  /** Unique query identifier */
  id: string;
  /** Search terms */
  query: string;
  /** Query options */
  options: SearchQueryOptions;
  /** When the query was created */
  createdAt: Date;
  /** Query status */
  status: SearchStatus;
}

/**
 * Search results container
 */
export interface SearchResults {
  /** Query that produced these results */
  queryId: string;
  /** Search query text */
  query: string;
  /** Engine used */
  engine: SearchEngine;
  /** Result items */
  items: SearchResultItem[];
  /** Total available results */
  totalResults: number;
  /** Time taken in milliseconds */
  duration: number;
  /** Whether results are truncated */
  truncated: boolean;
  /** Search timestamp */
  searchedAt: Date;
  /** Error message if failed */
  error?: string;
}

/**
 * Search filter options
 */
export interface SearchFilter {
  /** Filter by domain */
  domain?: string | string[];
  /** Exclude domains */
  excludeDomain?: string | string[];
  /** Filter by result type */
  type?: SearchResultType | SearchResultType[];
  /** Minimum relevance score */
  minRelevance?: number;
  /** Date range filter */
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  /** Filter by keywords in title */
  titleContains?: string;
  /** Filter by keywords in snippet */
  snippetContains?: string;
}

/**
 * Search sort options
 */
export interface SearchSortOptions {
  /** Sort field */
  field: 'relevance' | 'date' | 'position';
  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Paginated search result list
 */
export interface SearchListResult {
  /** Result items */
  items: SearchResultItem[];
  /** Total count */
  total: number;
  /** Current page */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total pages */
  totalPages: number;
  /** Has more results */
  hasMore: boolean;
}

/**
 * Content extraction result
 */
export interface ExtractedContent {
  /** Source URL */
  url: string;
  /** Page title */
  title: string;
  /** Main content text */
  content: string;
  /** Content word count */
  wordCount: number;
  /** Extracted images */
  images?: Array<{
    url: string;
    alt?: string;
  }>;
  /** Extracted links */
  links?: Array<{
    url: string;
    text?: string;
  }>;
  /** Page metadata */
  metadata?: {
    description?: string;
    author?: string;
    publishedDate?: Date;
    modifiedDate?: Date;
    keywords?: string[];
  };
  /** Extraction timestamp */
  extractedAt: Date;
}

/**
 * Search cache entry
 */
export interface SearchCacheEntry {
  /** Cache key */
  key: string;
  /** Cached results */
  results: SearchResults;
  /** When cached */
  cachedAt: Date;
  /** Cache expiry */
  expiresAt: Date;
}

/**
 * Web search configuration
 */
export interface WebSearchConfig {
  /** Default search engine */
  defaultEngine: SearchEngine;
  /** Default max results */
  defaultMaxResults: number;
  /** Default timeout in ms */
  defaultTimeout: number;
  /** Enable caching */
  enableCache: boolean;
  /** Cache TTL in seconds */
  cacheTtl: number;
  /** Maximum cache entries */
  maxCacheEntries: number;
  /** Enable safe search by default */
  defaultSafeSearch: boolean;
  /** Default language */
  defaultLanguage: string;
  /** Default country */
  defaultCountry: string;
  /** Enable content extraction */
  enableContentExtraction: boolean;
  /** User agent for requests */
  userAgent: string;
  /** API keys for search engines */
  apiKeys?: {
    google?: string;
    bing?: string;
  };
  /** Custom headers */
  customHeaders?: Record<string, string>;
}

/**
 * Default web search configuration
 */
export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  defaultEngine: 'duckduckgo',
  defaultMaxResults: 10,
  defaultTimeout: 30000,
  enableCache: true,
  cacheTtl: 3600,
  maxCacheEntries: 100,
  defaultSafeSearch: true,
  defaultLanguage: 'en',
  defaultCountry: 'us',
  enableContentExtraction: true,
  userAgent: 'Mozilla/5.0 (compatible; UbotSearchBot/1.0)',
};

/**
 * Search statistics
 */
export interface SearchStats {
  /** Total searches performed */
  totalSearches: number;
  /** Successful searches */
  successfulSearches: number;
  /** Failed searches */
  failedSearches: number;
  /** Total results retrieved */
  totalResults: number;
  /** Average search duration */
  averageDuration: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Searches by engine */
  searchesByEngine: Record<SearchEngine, number>;
  /** Last search timestamp */
  lastSearchAt?: Date;
}

/**
 * Batch search operation
 */
export interface BatchSearchItem {
  /** Item identifier */
  id: string;
  /** Search query */
  query: string;
  /** Query options */
  options?: SearchQueryOptions;
}

/**
 * Batch search result
 */
export interface BatchSearchResult {
  /** Item identifier */
  id: string;
  /** Search results (if successful) */
  results?: SearchResults;
  /** Error message (if failed) */
  error?: string;
  /** Whether the search was successful */
  success: boolean;
}

/**
 * Web Search Skill definition
 */
export const WEB_SEARCH_SKILL = {
  id: 'web-search',
  name: 'Web Search',
  description: 'Search the web for information using various search engines',
  category: 'domain',
  level: 'intermediate',
  tags: ['search', 'web', 'information', 'research'],
  metadata: {
    version: '1.0.0',
    author: 'ubot-core',
    capabilities: [
      'search-web',
      'extract-content',
      'batch-search',
      'cache-results',
    ],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Web search skill options
 */
export interface WebSearchSkillOptions {
  /** Configuration */
  config?: Partial<WebSearchConfig>;
  /** Enable logging */
  enableLogging?: boolean;
}