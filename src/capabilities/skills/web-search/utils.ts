/**
 * Web Search Skill Utilities
 */

import type {
  SearchResultItem,
  SearchResults,
  SearchFilter,
  SearchSortOptions,
  SearchListResult,
  SearchCacheEntry,
  SearchEngine,
  SearchResultType,
} from './types.js';

/**
 * Generate a unique search ID
 */
export function generateSearchId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `search_${timestamp}_${random}`;
}

/**
 * Generate a unique result ID
 */
export function generateResultId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `result_${timestamp}_${random}`;
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Normalize search query
 */
export function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-".]/g, '')
    .substring(0, 500);
}

/**
 * Build search URL for a given engine
 */
export function buildSearchUrl(
  engine: SearchEngine,
  query: string,
  options?: { customUrl?: string }
): string {
  const encodedQuery = encodeURIComponent(query);

  switch (engine) {
    case 'google':
      return `https://www.google.com/search?q=${encodedQuery}`;
    case 'bing':
      return `https://www.bing.com/search?q=${encodedQuery}`;
    case 'duckduckgo':
      return `https://duckduckgo.com/?q=${encodedQuery}`;
    case 'custom':
      if (options?.customUrl) {
        return options.customUrl.replace('{query}', encodedQuery);
      }
      throw new Error('Custom engine URL required for custom search engine');
    default:
      return `https://duckduckgo.com/?q=${encodedQuery}`;
  }
}

/**
 * Calculate relevance score for a result
 */
export function calculateRelevanceScore(
  result: SearchResultItem,
  query: string
): number {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const title = result.title.toLowerCase();
  const snippet = result.snippet.toLowerCase();

  let score = 0;
  const maxScore = queryTerms.length * 3;

  for (const term of queryTerms) {
    // Title matches are weighted higher
    if (title.includes(term)) {
      score += 2;
    }
    // Snippet matches
    if (snippet.includes(term)) {
      score += 1;
    }
  }

  // Position bonus (higher position = lower bonus)
  const positionBonus = Math.max(0, 1 - result.position / 100);
  score += positionBonus;

  return Math.min(1, score / maxScore);
}

/**
 * Filter search results
 */
export function filterResults(
  results: SearchResultItem[],
  filter: SearchFilter
): SearchResultItem[] {
  return results.filter((result) => {
    // Domain filter
    if (filter.domain) {
      const domains = Array.isArray(filter.domain)
        ? filter.domain
        : [filter.domain];
      const matchesDomain = domains.some(
        (d) => result.domain === d || result.domain.endsWith(`.${d}`)
      );
      if (!matchesDomain) return false;
    }

    // Exclude domain filter
    if (filter.excludeDomain) {
      const excludeDomains = Array.isArray(filter.excludeDomain)
        ? filter.excludeDomain
        : [filter.excludeDomain];
      const isExcluded = excludeDomains.some(
        (d) => result.domain === d || result.domain.endsWith(`.${d}`)
      );
      if (isExcluded) return false;
    }

    // Type filter
    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      if (!types.includes(result.type)) return false;
    }

    // Minimum relevance filter
    if (filter.minRelevance !== undefined) {
      if (result.relevanceScore < filter.minRelevance) return false;
    }

    // Date range filter
    if (filter.dateRange && result.publishedDate) {
      if (
        filter.dateRange.start &&
        result.publishedDate < filter.dateRange.start
      ) {
        return false;
      }
      if (filter.dateRange.end && result.publishedDate > filter.dateRange.end) {
        return false;
      }
    }

    // Title contains filter
    if (filter.titleContains) {
      if (
        !result.title.toLowerCase().includes(filter.titleContains.toLowerCase())
      ) {
        return false;
      }
    }

    // Snippet contains filter
    if (filter.snippetContains) {
      if (
        !result.snippet
          .toLowerCase()
          .includes(filter.snippetContains.toLowerCase())
      ) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort search results
 */
export function sortResults(
  results: SearchResultItem[],
  sort: SearchSortOptions
): SearchResultItem[] {
  const sorted = [...results];

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case 'relevance':
        comparison = a.relevanceScore - b.relevanceScore;
        break;
      case 'date':
        const aDate = a.publishedDate?.getTime() ?? 0;
        const bDate = b.publishedDate?.getTime() ?? 0;
        comparison = aDate - bDate;
        break;
      case 'position':
        comparison = a.position - b.position;
        break;
    }

    return sort.direction === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

/**
 * Paginate search results
 */
export function paginateResults(
  results: SearchResultItem[],
  page: number,
  pageSize: number
): SearchListResult {
  const total = results.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const items = results.slice(startIndex, endIndex);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page < totalPages,
  };
}

/**
 * Generate cache key for a search
 */
export function generateCacheKey(
  query: string,
  engine: SearchEngine,
  options?: Record<string, unknown>
): string {
  const normalizedQuery = normalizeQuery(query);
  const optionsStr = options ? JSON.stringify(options) : '';
  const hash = simpleHash(`${normalizedQuery}:${engine}:${optionsStr}`);
  return `search_${hash}`;
}

/**
 * Simple hash function for cache keys
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Check if cache entry is expired
 */
export function isCacheExpired(entry: SearchCacheEntry): boolean {
  return new Date() > entry.expiresAt;
}

/**
 * Deduplicate results by URL
 */
export function deduplicateResults(
  results: SearchResultItem[]
): SearchResultItem[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.url)) {
      return false;
    }
    seen.add(result.url);
    return true;
  });
}

/**
 * Merge multiple search results
 */
export function mergeResults(
  resultSets: SearchResults[],
  maxResults?: number
): SearchResults {
  if (resultSets.length === 0) {
    throw new Error('No result sets to merge');
  }

  const allItems: SearchResultItem[] = [];
  let totalResults = 0;
  let totalDuration = 0;

  for (const set of resultSets) {
    allItems.push(...set.items);
    totalResults += set.totalResults;
    totalDuration += set.duration;
  }

  // Deduplicate and sort by relevance
  const deduped = deduplicateResults(allItems);
  const sorted = sortResults(deduped, { field: 'relevance', direction: 'desc' });
  const limited = maxResults ? sorted.slice(0, maxResults) : sorted;

  return {
    queryId: generateSearchId(),
    query: resultSets[0].query,
    engine: 'duckduckgo',
    items: limited,
    totalResults,
    duration: totalDuration,
    truncated: limited.length < allItems.length,
    searchedAt: new Date(),
  };
}

/**
 * Parse search result type from URL or content
 */
export function detectResultType(url: string): SearchResultType {
  const domain = extractDomain(url).toLowerCase();
  const path = new URL(url).pathname.toLowerCase();

  // Image patterns
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path) || path.includes('/image')) {
    return 'image';
  }

  // Video patterns
  if (/\.(mp4|webm|avi|mov)$/i.test(path) || path.includes('/video')) {
    return 'video';
  }

  // News sites
  const newsDomains = ['news', 'cnn', 'bbc', 'reuters', 'nytimes', 'theguardian'];
  if (newsDomains.some((d) => domain.includes(d))) {
    return 'news';
  }

  // Academic sites
  const academicDomains = ['scholar', 'arxiv', 'pubmed', 'researchgate', 'academia'];
  if (academicDomains.some((d) => domain.includes(d))) {
    return 'academic';
  }

  // Social media
  const socialDomains = ['twitter', 'facebook', 'instagram', 'linkedin', 'reddit'];
  if (socialDomains.some((d) => domain.includes(d))) {
    return 'social';
  }

  return 'web';
}

/**
 * Validate search query
 */
export function validateQuery(query: string): { valid: boolean; error?: string } {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Query is required' };
  }

  const normalized = normalizeQuery(query);
  if (normalized.length === 0) {
    return { valid: false, error: 'Query cannot be empty' };
  }

  if (normalized.length < 2) {
    return { valid: false, error: 'Query is too short' };
  }

  return { valid: true };
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Create default search statistics
 */
export function createDefaultStats(): import('./types.js').SearchStats {
  return {
    totalSearches: 0,
    successfulSearches: 0,
    failedSearches: 0,
    totalResults: 0,
    averageDuration: 0,
    cacheHits: 0,
    cacheMisses: 0,
    searchesByEngine: {
      google: 0,
      bing: 0,
      duckduckgo: 0,
      custom: 0,
    },
  };
}