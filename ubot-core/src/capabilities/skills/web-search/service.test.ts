/**
 * Web Search Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WebSearchService,
  createWebSearchService,
  resetWebSearchService,
} from './service.js';
import type { WebSearchConfig } from './types.js';
import { DEFAULT_WEB_SEARCH_CONFIG } from './types.js';
import {
  generateSearchId,
  generateResultId,
  extractDomain,
  normalizeQuery,
  calculateRelevanceScore,
  filterResults,
  sortResults,
  paginateResults,
  validateQuery,
  deduplicateResults,
  detectResultType,
} from './utils.js';

describe('WebSearchService', () => {
  let service: WebSearchService;

  beforeEach(() => {
    resetWebSearchService();
    service = createWebSearchService({
      enableCache: true,
      cacheTtl: 60,
      defaultMaxResults: 5,
    });
  });

  afterEach(() => {
    service.clearCache();
    resetWebSearchService();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const defaultService = createWebSearchService();
      const config = defaultService.getConfig();
      expect(config.defaultEngine).toBe(DEFAULT_WEB_SEARCH_CONFIG.defaultEngine);
      expect(config.enableCache).toBe(DEFAULT_WEB_SEARCH_CONFIG.enableCache);
    });

    it('should merge custom config with defaults', () => {
      const customService = createWebSearchService({
        defaultEngine: 'google',
        defaultMaxResults: 20,
      });
      const config = customService.getConfig();
      expect(config.defaultEngine).toBe('google');
      expect(config.defaultMaxResults).toBe(20);
      expect(config.enableCache).toBe(DEFAULT_WEB_SEARCH_CONFIG.enableCache);
    });
  });

  describe('search', () => {
    it('should perform a search and return results', async () => {
      const results = await service.search('test query');
      
      expect(results).toBeDefined();
      expect(results.query).toBe('test query');
      expect(results.items).toBeInstanceOf(Array);
      expect(results.searchedAt).toBeInstanceOf(Date);
    }, 30000);

    it('should normalize the query', async () => {
      const results = await service.search('  TEST   QUERY  ');
      expect(results.query).toBe('TEST QUERY');
    }, 30000);

    it('should throw on empty query', async () => {
      await expect(service.search('')).rejects.toThrow('Query is required');
    });

    it('should throw on too short query', async () => {
      await expect(service.search('a')).rejects.toThrow('too short');
    });

    it('should respect maxResults option', async () => {
      const results = await service.search('test', { maxResults: 3 });
      expect(results.items.length).toBeLessThanOrEqual(3);
    }, 30000);

    it('should update statistics after search', async () => {
      await service.search('test query');
      const stats = service.getStats();
      
      expect(stats.totalSearches).toBe(1);
      expect(stats.successfulSearches).toBe(1);
      expect(stats.totalResults).toBeGreaterThan(0);
    }, 30000);

    it('should cache results', async () => {
      const results1 = await service.search('cache test');
      const results2 = await service.search('cache test');
      
      expect(results1.queryId).toBe(results2.queryId);
      expect(service.getStats().cacheHits).toBe(1);
    }, 30000);
  });

  describe('extractContent', () => {
    it('should extract content from URL', async () => {
      const content = await service.extractContent('https://example.com/article');
      
      expect(content).toBeDefined();
      expect(content.url).toBe('https://example.com/article');
      expect(content.title).toBeDefined();
      expect(content.content).toBeDefined();
      expect(content.wordCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('batchSearch', () => {
    it('should perform multiple searches', async () => {
      const items = [
        { id: '1', query: 'first query' },
        { id: '2', query: 'second query' },
      ];
      
      const results = await service.batchSearch(items);
      
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('1');
      expect(results[0].success).toBe(true);
      expect(results[1].id).toBe('2');
      expect(results[1].success).toBe(true);
    }, 60000);
  });

  describe('filterAndPaginate', () => {
    it('should filter and paginate results', async () => {
      const searchResults = await service.search('test');
      const paginated = service.filterAndPaginate(
        searchResults,
        undefined,
        undefined,
        1,
        2
      );
      
      expect(paginated.items.length).toBeLessThanOrEqual(2);
      expect(paginated.page).toBe(1);
      expect(paginated.pageSize).toBe(2);
    }, 30000);
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      await service.search('test');
      expect(service.getCacheSize()).toBeGreaterThan(0);
      
      service.clearCache();
      expect(service.getCacheSize()).toBe(0);
    }, 30000);
  });

  describe('statistics', () => {
    it('should return statistics', () => {
      const stats = service.getStats();
      
      expect(stats.totalSearches).toBe(0);
      expect(stats.successfulSearches).toBe(0);
      expect(stats.failedSearches).toBe(0);
    });

    it('should reset statistics', async () => {
      await service.search('test');
      service.resetStats();
      
      const stats = service.getStats();
      expect(stats.totalSearches).toBe(0);
    }, 30000);
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      service.updateConfig({ defaultMaxResults: 50 });
      const config = service.getConfig();
      expect(config.defaultMaxResults).toBe(50);
    });

    it('should return configuration copy', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();
      expect(config1).not.toBe(config2);
    });
  });

  describe('health check', () => {
    it('should return healthy status', () => {
      expect(service.isHealthy()).toBe(true);
    });
  });
});

describe('Web Search Utilities', () => {
  describe('generateSearchId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateSearchId();
      const id2 = generateSearchId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^search_/);
    });
  });

  describe('generateResultId', () => {
    it('should generate unique result IDs', () => {
      const id1 = generateResultId();
      const id2 = generateResultId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^result_/);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from URL', () => {
      expect(extractDomain('https://www.example.com/path')).toBe('example.com');
      expect(extractDomain('https://subdomain.example.com')).toBe('subdomain.example.com');
    });

    it('should return empty string for invalid URLs', () => {
      expect(extractDomain('not a url')).toBe('');
    });
  });

  describe('normalizeQuery', () => {
    it('should normalize whitespace', () => {
      expect(normalizeQuery('  test   query  ')).toBe('test query');
    });

    it('should limit query length', () => {
      const longQuery = 'a'.repeat(600);
      expect(normalizeQuery(longQuery).length).toBeLessThanOrEqual(500);
    });
  });

  describe('calculateRelevanceScore', () => {
    it('should calculate score based on query terms', () => {
      const result = {
        id: '1',
        title: 'Test Result Title',
        url: 'https://example.com',
        snippet: 'This is a test snippet',
        type: 'web' as const,
        domain: 'example.com',
        relevanceScore: 0,
        position: 1,
        retrievedAt: new Date(),
      };
      
      const score = calculateRelevanceScore(result, 'test');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('filterResults', () => {
    const results = [
      {
        id: '1',
        title: 'Test Result',
        url: 'https://example.com',
        snippet: 'Test snippet',
        type: 'web' as const,
        domain: 'example.com',
        relevanceScore: 0.9,
        position: 1,
        retrievedAt: new Date(),
      },
      {
        id: '2',
        title: 'Another Result',
        url: 'https://test.org',
        snippet: 'Another snippet',
        type: 'news' as const,
        domain: 'test.org',
        relevanceScore: 0.5,
        position: 2,
        retrievedAt: new Date(),
      },
    ];

    it('should filter by domain', () => {
      const filtered = filterResults(results, { domain: 'example.com' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].domain).toBe('example.com');
    });

    it('should filter by type', () => {
      const filtered = filterResults(results, { type: 'news' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe('news');
    });

    it('should filter by minimum relevance', () => {
      const filtered = filterResults(results, { minRelevance: 0.8 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].relevanceScore).toBe(0.9);
    });
  });

  describe('sortResults', () => {
    const results = [
      {
        id: '1',
        title: 'Result A',
        url: 'https://a.com',
        snippet: '',
        type: 'web' as const,
        domain: 'a.com',
        relevanceScore: 0.5,
        position: 2,
        retrievedAt: new Date(),
      },
      {
        id: '2',
        title: 'Result B',
        url: 'https://b.com',
        snippet: '',
        type: 'web' as const,
        domain: 'b.com',
        relevanceScore: 0.9,
        position: 1,
        retrievedAt: new Date(),
      },
    ];

    it('should sort by relevance descending', () => {
      const sorted = sortResults(results, { field: 'relevance', direction: 'desc' });
      expect(sorted[0].relevanceScore).toBe(0.9);
    });

    it('should sort by position ascending', () => {
      const sorted = sortResults(results, { field: 'position', direction: 'asc' });
      expect(sorted[0].position).toBe(1);
    });
  });

  describe('paginateResults', () => {
    const results = Array.from({ length: 25 }, (_, i) => ({
      id: `${i + 1}`,
      title: `Result ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      snippet: '',
      type: 'web' as const,
      domain: 'example.com',
      relevanceScore: 0.5,
      position: i + 1,
      retrievedAt: new Date(),
    }));

    it('should paginate results correctly', () => {
      const page1 = paginateResults(results, 1, 10);
      expect(page1.items).toHaveLength(10);
      expect(page1.total).toBe(25);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBe(3);
      expect(page1.hasMore).toBe(true);
    });

    it('should handle last page', () => {
      const lastPage = paginateResults(results, 3, 10);
      expect(lastPage.items).toHaveLength(5);
      expect(lastPage.hasMore).toBe(false);
    });
  });

  describe('validateQuery', () => {
    it('should validate a good query', () => {
      const result = validateQuery('test query');
      expect(result.valid).toBe(true);
    });

    it('should reject empty query', () => {
      const result = validateQuery('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject too short query', () => {
      const result = validateQuery('a');
      expect(result.valid).toBe(false);
    });
  });

  describe('deduplicateResults', () => {
    it('should remove duplicate URLs', () => {
      const results = [
        {
          id: '1',
          title: 'First',
          url: 'https://example.com/page',
          snippet: '',
          type: 'web' as const,
          domain: 'example.com',
          relevanceScore: 0.5,
          position: 1,
          retrievedAt: new Date(),
        },
        {
          id: '2',
          title: 'Duplicate',
          url: 'https://example.com/page',
          snippet: '',
          type: 'web' as const,
          domain: 'example.com',
          relevanceScore: 0.5,
          position: 2,
          retrievedAt: new Date(),
        },
        {
          id: '3',
          title: 'Unique',
          url: 'https://example.com/other',
          snippet: '',
          type: 'web' as const,
          domain: 'example.com',
          relevanceScore: 0.5,
          position: 3,
          retrievedAt: new Date(),
        },
      ];

      const deduped = deduplicateResults(results);
      expect(deduped).toHaveLength(2);
    });
  });

  describe('detectResultType', () => {
    it('should detect image type', () => {
      expect(detectResultType('https://example.com/image.jpg')).toBe('image');
    });

    it('should detect video type', () => {
      expect(detectResultType('https://example.com/video.mp4')).toBe('video');
    });

    it('should detect news type', () => {
      expect(detectResultType('https://news.example.com/article')).toBe('news');
    });

    it('should detect academic type', () => {
      expect(detectResultType('https://arxiv.org/paper')).toBe('academic');
    });

    it('should detect social type', () => {
      expect(detectResultType('https://twitter.com/user')).toBe('social');
    });

    it('should default to web type', () => {
      expect(detectResultType('https://example.com/page')).toBe('web');
    });
  });
});