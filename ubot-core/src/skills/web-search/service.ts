/**
 * Web Search Skill Service
 */

import type { LoggerInstance } from '../../logger/types.js';
import { getLogger } from '../../logger/index.js';
import type {
  WebSearchConfig,
  SearchQueryOptions,
  SearchResults,
  SearchResultItem,
  SearchFilter,
  SearchSortOptions,
  SearchListResult,
  SearchStats,
  SearchCacheEntry,
  BatchSearchItem,
  BatchSearchResult,
  ExtractedContent,
  SearchEngine,
} from './types.js';
import {
  DEFAULT_WEB_SEARCH_CONFIG,
  WEB_SEARCH_SKILL,
} from './types.js';
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
  validateQuery,
  createDefaultStats,
  detectResultType,
} from './utils.js';

/**
 * Web Search Service
 */
export class WebSearchService {
  private config: WebSearchConfig;
  private logger: LoggerInstance;
  private cache: Map<string, SearchCacheEntry> = new Map();
  private stats: SearchStats;
  private abortController: AbortController | null = null;

  constructor(config?: Partial<WebSearchConfig>) {
    this.config = { ...DEFAULT_WEB_SEARCH_CONFIG, ...config };
    this.logger = getLogger();
    this.stats = createDefaultStats();
  }

  /**
   * Perform a web search
   */
  async search(query: string, options?: SearchQueryOptions): Promise<SearchResults> {
    const queryId = generateSearchId();
    const startTime = Date.now();

    // Validate query
    const validation = validateQuery(query);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedQuery = normalizeQuery(query);
    const engine = options?.engine ?? this.config.defaultEngine;

    // Check cache
    if (this.config.enableCache) {
      const cacheKey = generateCacheKey(normalizedQuery, engine, options as Record<string, unknown> | undefined);
      const cached = this.cache.get(cacheKey);
      if (cached && !isCacheExpired(cached)) {
        this.stats.cacheHits++;
        this.logger.debug('Cache hit for search query', { queryId, cacheKey });
        return cached.results;
      }
      this.stats.cacheMisses++;
    }

    this.stats.totalSearches++;
    this.stats.searchesByEngine[engine]++;

    try {
      this.logger.info('Starting web search', { queryId, query: normalizedQuery, engine });

      // Perform the search
      const results = await this.executeSearch(normalizedQuery, engine, options);

      // Calculate relevance scores
      for (const item of results.items) {
        item.relevanceScore = calculateRelevanceScore(item, normalizedQuery);
      }

      const duration = Date.now() - startTime;
      results.queryId = queryId;
      results.duration = duration;

      // Update stats
      this.stats.successfulSearches++;
      this.stats.totalResults += results.items.length;
      this.stats.averageDuration =
        (this.stats.averageDuration * (this.stats.successfulSearches - 1) + duration) /
        this.stats.successfulSearches;
      this.stats.lastSearchAt = new Date();

      // Cache results
      if (this.config.enableCache) {
        const cacheKey = generateCacheKey(normalizedQuery, engine, options as Record<string, unknown> | undefined);
        this.addToCache(cacheKey, results);
      }

      this.logger.info('Web search completed', {
        queryId,
        resultCount: results.items.length,
        duration,
      });

      return results;
    } catch (error) {
      this.stats.failedSearches++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Web search failed', { queryId, error: errorMessage });

      return {
        queryId,
        query: normalizedQuery,
        engine,
        items: [],
        totalResults: 0,
        duration: Date.now() - startTime,
        truncated: false,
        searchedAt: new Date(),
        error: errorMessage,
      };
    }
  }

  /**
   * Execute the actual search (simulated for now)
   */
  private async executeSearch(
    query: string,
    engine: SearchEngine,
    options?: SearchQueryOptions
  ): Promise<SearchResults> {
    const maxResults = options?.maxResults ?? this.config.defaultMaxResults;
    const timeout = options?.timeout ?? this.config.defaultTimeout;

    // Create abort controller for timeout
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => this.abortController?.abort(), timeout);

    try {
      // Simulate search results (in production, this would call actual search APIs)
      const items = await this.fetchSearchResults(query, engine, maxResults, options);

      return {
        queryId: '',
        query,
        engine,
        items,
        totalResults: items.length,
        duration: 0,
        truncated: false,
        searchedAt: new Date(),
      };
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  /**
   * Fetch search results from search engine
   * This is a simulated implementation - in production, integrate with actual APIs
   */
  private async fetchSearchResults(
    query: string,
    engine: SearchEngine,
    maxResults: number,
    options?: SearchQueryOptions
  ): Promise<SearchResultItem[]> {
    // Simulated results for demonstration
    // In production, this would make actual API calls to search engines
    const simulatedResults: SearchResultItem[] = [];
    const domains = [
      'wikipedia.org',
      'stackoverflow.com',
      'github.com',
      'medium.com',
      'dev.to',
    ];

    for (let i = 0; i < Math.min(maxResults, 10); i++) {
      const domain = domains[i % domains.length];
      const resultType = detectResultType(`https://${domain}/page/${i}`);

      simulatedResults.push({
        id: generateResultId(),
        title: `${query} - Result ${i + 1} from ${domain}`,
        url: `https://${domain}/search?q=${encodeURIComponent(query)}&page=${i}`,
        snippet: `This is a simulated search result for "${query}" from ${domain}. In production, this would contain actual search result snippets.`,
        type: resultType,
        domain,
        relevanceScore: 0.9 - i * 0.05,
        position: i + 1,
        retrievedAt: new Date(),
      });
    }

    // Apply type filter if specified
    if (options?.type) {
      return simulatedResults.filter((r) => r.type === options.type);
    }

    return simulatedResults;
  }

  /**
   * Extract content from a URL
   */
  async extractContent(url: string): Promise<ExtractedContent> {
    this.logger.info('Extracting content from URL', { url });

    if (!this.config.enableContentExtraction) {
      throw new Error('Content extraction is disabled');
    }

    // Simulated content extraction
    // In production, this would fetch and parse the actual page
    const domain = extractDomain(url);

    return {
      url,
      title: `Content from ${domain}`,
      content: `This is simulated extracted content from ${url}. In production, this would contain the actual page content.`,
      wordCount: 100,
      extractedAt: new Date(),
      metadata: {
        description: `Extracted content from ${domain}`,
      },
    };
  }

  /**
   * Perform batch searches
   */
  async batchSearch(items: BatchSearchItem[]): Promise<BatchSearchResult[]> {
    this.logger.info('Starting batch search', { count: items.length });

    const results: BatchSearchResult[] = [];

    for (const item of items) {
      try {
        const searchResults = await this.search(item.query, item.options);
        results.push({
          id: item.id,
          results: searchResults,
          success: true,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          id: item.id,
          error: errorMessage,
          success: false,
        });
      }
    }

    return results;
  }

  /**
   * Filter and paginate existing results
   */
  filterAndPaginate(
    results: SearchResults,
    filter?: SearchFilter,
    sort?: SearchSortOptions,
    page: number = 1,
    pageSize: number = 10
  ): SearchListResult {
    let items = [...results.items];

    // Apply filter
    if (filter) {
      items = filterResults(items, filter);
    }

    // Apply sort
    if (sort) {
      items = sortResults(items, sort);
    }

    // Paginate
    return paginateResults(items, page, pageSize);
  }

  /**
   * Get search statistics
   */
  getStats(): SearchStats {
    return { ...this.stats };
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Search cache cleared');
  }

  /**
   * Cancel ongoing search
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.logger.info('Search cancelled');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WebSearchConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Web search configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): WebSearchConfig {
    return { ...this.config };
  }

  /**
   * Add entry to cache with LRU eviction
   */
  private addToCache(key: string, results: SearchResults): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.config.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      key,
      results,
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.cacheTtl * 1000),
    });
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return true;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = createDefaultStats();
    this.logger.info('Search statistics reset');
  }
}

// Singleton instance
let webSearchService: WebSearchService | null = null;

/**
 * Create a new web search service
 */
export function createWebSearchService(
  config?: Partial<WebSearchConfig>
): WebSearchService {
  return new WebSearchService(config);
}

/**
 * Get the singleton web search service
 */
export function getWebSearchService(): WebSearchService {
  if (!webSearchService) {
    webSearchService = createWebSearchService();
  }
  return webSearchService;
}

/**
 * Reset the singleton service
 */
export function resetWebSearchService(): void {
  webSearchService = null;
}