import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryService, createMemoryService, resetMemoryService } from './service.js';
import type { Memory, MemoryFilter, MemorySearchOptions } from './types.js';

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(() => {
    resetMemoryService();
    service = createMemoryService();
  });

  afterEach(() => {
    service.stopAutoConsolidation();
  });

  describe('store', () => {
    it('should store a new memory', async () => {
      const memory = await service.store(
        'agent-1',
        'This is a test memory',
        'short-term',
        'normal'
      );

      expect(memory.id).toBeDefined();
      expect(memory.agentId).toBe('agent-1');
      expect(memory.content).toBe('This is a test memory');
      expect(memory.type).toBe('short-term');
      expect(memory.priority).toBe('normal');
      expect(memory.status).toBe('active');
    });

    it('should throw error for empty content', async () => {
      await expect(service.store('agent-1', '')).rejects.toThrow('Memory content cannot be empty');
    });

    it('should throw error for invalid memory type', async () => {
      await expect(
        service.store('agent-1', 'test', 'invalid' as unknown as 'short-term')
      ).rejects.toThrow('Invalid memory type');
    });

    it('should create associations with existing memories', async () => {
      const memory1 = await service.store('agent-1', 'First memory');
      const memory2 = await service.store(
        'agent-1',
        'Second memory',
        'short-term',
        'normal',
        { associateWith: [memory1.id] }
      );

      const stats = await service.getStats('agent-1');
      expect(stats.totalAssociations).toBe(1);
    });
  });

  describe('recall', () => {
    beforeEach(async () => {
      await service.store('agent-1', 'Memory 1', 'short-term');
      await service.store('agent-1', 'Memory 2', 'long-term');
      await service.store('agent-1', 'Memory 3', 'episodic');
      await service.store('agent-2', 'Other agent memory', 'short-term');
    });

    it('should recall memories for an agent', async () => {
      const result = await service.recall('agent-1');
      
      expect(result.memories.length).toBe(3);
      expect(result.totalRecalled).toBe(3);
    });

    it('should filter memories by type', async () => {
      const result = await service.recall('agent-1', { types: ['short-term'] });
      
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].type).toBe('short-term');
    });

    it('should limit number of recalled memories', async () => {
      const result = await service.recall('agent-1', {}, { limit: 2 });
      
      expect(result.memories.length).toBe(2);
    });

    it('should update access stats on recall', async () => {
      await service.recall('agent-1');
      
      const result = await service.recall('agent-1');
      expect(result.memories[0].metadata.accessCount).toBe(2);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await service.store('agent-1', 'The quick brown fox jumps over the lazy dog');
      await service.store('agent-1', 'A brown bear sleeps in the forest');
      await service.store('agent-1', 'The ocean is deep and blue');
    });

    it('should search memories by query', async () => {
      const result = await service.search('agent-1', { query: 'brown' });
      
      expect(result.totalMatches).toBe(2);
    });

    it('should return exact matches with higher scores', async () => {
      const result = await service.search('agent-1', { query: 'ocean' });
      
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].matchType).toBe('exact');
      expect(result.matches[0].score).toBe(1.0);
    });

    it('should support fuzzy matching', async () => {
      const result = await service.search('agent-1', { 
        query: 'deep forest',
        fuzzyMatch: true 
      });
      
      expect(result.totalMatches).toBeGreaterThan(0);
    });
  });

  describe('update', () => {
    it('should update an existing memory', async () => {
      const memory = await service.store('agent-1', 'Original content');
      
      const updated = await service.update(memory.id, {
        content: 'Updated content',
        priority: 'high',
      });
      
      expect(updated).not.toBeNull();
      expect(updated?.content).toBe('Updated content');
      expect(updated?.priority).toBe('high');
    });

    it('should return null for non-existent memory', async () => {
      const result = await service.update('non-existent', { content: 'test' });
      expect(result).toBeNull();
    });

    it('should validate content on update', async () => {
      const memory = await service.store('agent-1', 'Original');
      
      await expect(
        service.update(memory.id, { content: '' })
      ).rejects.toThrow('Memory content cannot be empty');
    });
  });

  describe('delete', () => {
    it('should delete an existing memory', async () => {
      const memory = await service.store('agent-1', 'To be deleted');
      
      const result = await service.delete(memory.id);
      expect(result).toBe(true);
      
      const retrieved = await service.get(memory.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent memory', async () => {
      const result = await service.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('consolidate', () => {
    it('should consolidate memories', async () => {
      // Create multiple short-term memories
      for (let i = 0; i < 5; i++) {
        const memory = await service.store('agent-1', `Memory ${i}`, 'short-term');
        // Simulate access
        const currentMetadata = memory.metadata || {};
        await service.update(memory.id, { 
          metadata: { ...currentMetadata, accessCount: 5 } 
        });
      }

      const result = await service.consolidate('agent-1', {
        minAccessCount: 3,
        mergeSimilar: false,
      });

      expect(result.consolidated).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await service.store('agent-1', 'Memory 1', 'short-term', 'high');
      await service.store('agent-1', 'Memory 2', 'long-term', 'normal');
      await service.store('agent-2', 'Other memory', 'short-term', 'low');
    });

    it('should return stats for all memories', async () => {
      const stats = await service.getStats();
      
      expect(stats.totalMemories).toBe(3);
      expect(stats.byType['short-term']).toBe(2);
      expect(stats.byType['long-term']).toBe(1);
    });

    it('should return stats for specific agent', async () => {
      const stats = await service.getStats('agent-1');
      
      expect(stats.totalMemories).toBe(2);
    });

    it('should calculate average importance', async () => {
      const stats = await service.getStats('agent-1');
      
      expect(stats.averageImportance).toBeGreaterThanOrEqual(0);
      expect(stats.averageImportance).toBeLessThanOrEqual(1);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      for (let i = 0; i < 25; i++) {
        await service.store('agent-1', `Memory ${i}`, i % 2 === 0 ? 'short-term' : 'long-term');
      }
    });

    it('should list memories with pagination', async () => {
      const result = await service.list({}, { field: 'createdAt', direction: 'desc' }, 1, 10);
      
      expect(result.memories.length).toBe(10);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(true);
    });

    it('should filter memories in list', async () => {
      const result = await service.list({ types: ['short-term'] });
      
      expect(result.memories.every(m => m.type === 'short-term')).toBe(true);
    });
  });

  describe('batch', () => {
    it('should execute batch operations', async () => {
      const operations = [
        {
          operation: 'store' as const,
          memory: { agentId: 'agent-1', content: 'Batch memory 1' },
        },
        {
          operation: 'store' as const,
          memory: { agentId: 'agent-1', content: 'Batch memory 2' },
        },
        {
          operation: 'recall' as const,
          filter: { agentId: 'agent-1' },
        },
      ];

      const results = await service.batch(operations);
      
      expect(results.length).toBe(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
    });

    it('should handle batch operation errors', async () => {
      const operations = [
        {
          operation: 'store' as const,
          memory: { agentId: 'agent-1', content: '' }, // Invalid empty content
        },
      ];

      const results = await service.batch(operations);
      
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeDefined();
    });
  });

  describe('associations', () => {
    it('should create association between memories', async () => {
      const memory1 = await service.store('agent-1', 'Memory 1');
      const memory2 = await service.store('agent-1', 'Memory 2');
      
      const association = await service.createAssociation(
        memory1.id,
        memory2.id,
        'related',
        0.8
      );
      
      expect(association.sourceMemoryId).toBe(memory1.id);
      expect(association.targetMemoryId).toBe(memory2.id);
      expect(association.associationType).toBe('related');
      expect(association.strength).toBe(0.8);
    });

    it('should throw error for non-existent memories', async () => {
      await expect(
        service.createAssociation('non-existent', 'also-non-existent')
      ).rejects.toThrow('Both memories must exist');
    });
  });

  describe('clearAgent', () => {
    it('should clear all memories for an agent', async () => {
      await service.store('agent-1', 'Memory 1');
      await service.store('agent-1', 'Memory 2');
      await service.store('agent-2', 'Other memory');
      
      const count = await service.clearAgent('agent-1');
      
      expect(count).toBe(2);
      
      const stats = await service.getStats('agent-1');
      expect(stats.totalMemories).toBe(0);
      
      const allStats = await service.getStats();
      expect(allStats.totalMemories).toBe(1);
    });
  });
});
