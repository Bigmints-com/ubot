import type { LoggerInstance } from '../../logger/types.js';
import type {
  Memory,
  MemoryFilter,
  MemorySortOptions,
  MemoryListResult,
  MemoryStoreOptions,
  MemoryRecallOptions,
  MemoryRecallResult,
  MemoryConsolidationOptions,
  MemoryConsolidationResult,
  MemorySearchOptions,
  MemorySearchResult,
  MemorySearchMatch,
  MemoryStats,
  MemoryManagementConfig,
  MemorySkillOptions,
  MemoryAssociation,
  MemoryType,
  MemoryPriority,
  BatchMemoryOperation,
  BatchMemoryResult,
} from './types.js';
import {
  DEFAULT_MEMORY_CONFIG,
} from './types.js';
import {
  generateMemoryId,
  generateAssociationId,
  createDefaultMetadata,
  filterMemories,
  sortMemories,
  paginateMemories,
  updateAccessStats,
  calculateImportance,
  shouldForget,
  shouldConsolidate,
  calculateTextSimilarity,
  mergeMemories,
  validateMemoryContent,
  validateMemoryType,
  getMemoryTTL,
} from './utils.js';

/**
 * Memory Management Service
 * Handles storage, recall, consolidation, and association of agent memories
 */
export class MemoryService {
  private config: MemoryManagementConfig;
  private logger?: LoggerInstance;
  private memories: Map<string, Memory> = new Map();
  private associations: Map<string, MemoryAssociation> = new Map();
  private agentMemories: Map<string, Set<string>> = new Map();
  private consolidationTimer?: ReturnType<typeof setInterval>;

  constructor(options: MemorySkillOptions = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...options.config };
    this.logger = options.logger;
    
    this.logger?.info('Memory service initialized', {
      maxShortTerm: this.config.maxShortTermMemories,
      maxLongTerm: this.config.maxLongTermMemories,
    });
  }

  /**
   * Store a new memory
   */
  async store(
    agentId: string,
    content: string,
    type: MemoryType = 'short-term',
    priority: MemoryPriority = 'normal',
    options: MemoryStoreOptions = {}
  ): Promise<Memory> {
    const validation = validateMemoryContent(content);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const typeValidation = validateMemoryType(type);
    if (!typeValidation.valid) {
      throw new Error(typeValidation.error);
    }

    const id = generateMemoryId();
    const now = new Date();
    const ttl = options.ttl ?? getMemoryTTL(type);

    const memory: Memory = {
      id,
      agentId,
      type,
      priority,
      status: 'active',
      content: content.trim(),
      metadata: {
        ...createDefaultMetadata(),
        source: 'user',
        importance: calculateImportance(0, 0, priority, 1.0),
      },
      expiresAt: ttl > 0 ? new Date(now.getTime() + ttl) : undefined,
    };

    this.memories.set(id, memory);
    
    if (!this.agentMemories.has(agentId)) {
      this.agentMemories.set(agentId, new Set());
    }
    this.agentMemories.get(agentId)!.add(id);

    if (options.associateWith && options.associateWith.length > 0) {
      for (const targetId of options.associateWith) {
        if (this.memories.has(targetId)) {
          await this.createAssociation(id, targetId, 'related', 0.8);
        }
      }
    }

    this.logger?.debug('Memory stored', { id, agentId, type, priority });

    await this.enforceMemoryLimits(agentId, type);

    return memory;
  }

  /**
   * Recall memories based on filter and options
   */
  async recall(
    agentId: string,
    filter: MemoryFilter = {},
    options: MemoryRecallOptions = {}
  ): Promise<MemoryRecallResult> {
    const limit = options.limit ?? 10;
    const threshold = options.threshold ?? 0.0;
    const sortByRelevance = options.sortByRelevance ?? false;

    let memories = this.getMemoriesByAgent(agentId);
    
    memories = filterMemories(memories, { ...filter, agentId });

    memories = memories.filter(m => m.status === 'active');

    if (sortByRelevance) {
      memories.sort((a, b) => b.metadata.importance - a.metadata.importance);
    }

    memories = memories.slice(0, limit);

    memories = memories.map(m => updateAccessStats(m));
    memories.forEach(m => this.memories.set(m.id, m));

    let associations: MemoryAssociation[] = [];
    if (options.includeAssociations) {
      associations = this.getAssociationsForMemories(memories.map(m => m.id));
    }

    this.logger?.debug('Memory recall', {
      agentId,
      recalled: memories.length,
      total: this.memories.size,
    });

    return {
      memories,
      associations,
      totalRecalled: memories.length,
      recallAccuracy: memories.length > 0 ? 1.0 : 0.0,
    };
  }

  /**
   * Search memories by query
   */
  async search(
    agentId: string,
    searchOptions: MemorySearchOptions
  ): Promise<MemorySearchResult> {
    const startTime = Date.now();
    const { query, useEmbedding = false, fuzzyMatch = true, maxDistance = 0.3 } = searchOptions;

    let memories = this.getMemoriesByAgent(agentId);
    memories = memories.filter(m => m.status === 'active');

    const matches: MemorySearchMatch[] = [];
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/);

    for (const memory of memories) {
      const contentLower = memory.content.toLowerCase();
      let score = 0;
      let matchType: 'exact' | 'fuzzy' | 'semantic' = 'fuzzy';
      const positions: number[] = [];

      if (contentLower.includes(queryLower)) {
        matchType = 'exact';
        score = 1.0;
        let pos = contentLower.indexOf(queryLower);
        while (pos !== -1) {
          positions.push(pos);
          pos = contentLower.indexOf(queryLower, pos + 1);
        }
      } else if (fuzzyMatch) {
        const tokenMatches = queryTokens.filter(token => contentLower.includes(token));
        score = tokenMatches.length / queryTokens.length;
        matchType = 'fuzzy';
        
        for (const token of tokenMatches) {
          let pos = contentLower.indexOf(token);
          while (pos !== -1) {
            positions.push(pos);
            pos = contentLower.indexOf(token, pos + 1);
          }
        }
      }

      if (useEmbedding && memory.embedding) {
        const textSimilarity = calculateTextSimilarity(query, memory.content);
        if (textSimilarity > score) {
          score = textSimilarity;
          matchType = 'semantic';
        }
      }

      if (score > maxDistance) {
        const snippetStart = Math.max(0, (positions[0] ?? 0) - 50);
        const snippetEnd = Math.min(memory.content.length, snippetStart + 150);
        
        matches.push({
          memoryId: memory.id,
          snippet: memory.content.substring(snippetStart, snippetEnd),
          score,
          matchType,
          positions: [...new Set(positions)],
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);

    const matchedMemories = matches
      .slice(0, searchOptions.includeMetadata ? 50 : 20)
      .map(m => this.memories.get(m.memoryId))
      .filter((m): m is Memory => m !== undefined);

    const searchTime = Date.now() - startTime;

    this.logger?.debug('Memory search', {
      agentId,
      query: query.substring(0, 50),
      matches: matches.length,
      time: searchTime,
    });

    return {
      memories: matchedMemories,
      matches,
      totalMatches: matches.length,
      searchTime,
    };
  }

  /**
   * Update an existing memory
   */
  async update(
    memoryId: string,
    updates: Partial<Pick<Memory, 'content' | 'priority' | 'status' | 'context' | 'metadata'>>
  ): Promise<Memory | null> {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      return null;
    }

    if (updates.content !== undefined) {
      const validation = validateMemoryContent(updates.content);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    const updatedMemory: Memory = {
      ...memory,
      ...updates,
      metadata: {
        ...memory.metadata,
        ...updates.metadata,
        updatedAt: new Date(),
      },
    };

    this.memories.set(memoryId, updatedMemory);
    
    this.logger?.debug('Memory updated', { id: memoryId });
    
    return updatedMemory;
  }

  /**
   * Delete a memory
   */
  async delete(memoryId: string): Promise<boolean> {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      return false;
    }

    this.memories.delete(memoryId);
    
    const agentMemorySet = this.agentMemories.get(memory.agentId);
    if (agentMemorySet) {
      agentMemorySet.delete(memoryId);
    }

    for (const [assocId, assoc] of this.associations.entries()) {
      if (assoc.sourceMemoryId === memoryId || assoc.targetMemoryId === memoryId) {
        this.associations.delete(assocId);
      }
    }

    this.logger?.debug('Memory deleted', { id: memoryId });
    
    return true;
  }

  /**
   * Consolidate memories
   */
  async consolidate(
    agentId: string,
    options: MemoryConsolidationOptions = {}
  ): Promise<MemoryConsolidationResult> {
    const result: MemoryConsolidationResult = {
      consolidated: 0,
      archived: 0,
      forgotten: 0,
      merged: 0,
      errors: [],
    };

    let memories = this.getMemoriesByAgent(agentId);
    
    const toConsolidate: Memory[] = [];
    const toArchive: Memory[] = [];
    const toForget: Memory[] = [];

    for (const memory of memories) {
      if (shouldForget(memory, this.config.forgettingThreshold)) {
        toForget.push(memory);
      } else if (shouldConsolidate(memory, options.minAccessCount)) {
        toConsolidate.push(memory);
      } else if (options.preserveHighImportance && memory.metadata.importance >= this.config.importanceThreshold) {
        continue;
      }
    }

    for (const memory of toForget) {
      if (options.preserveHighImportance && memory.metadata.importance >= this.config.importanceThreshold) {
        memory.status = 'archived';
        toArchive.push(memory);
      } else {
        memory.status = 'forgotten';
        result.forgotten++;
      }
    }

    for (const memory of toArchive) {
      memory.status = 'archived';
      result.archived++;
    }

    if (options.mergeSimilar) {
      const shortTermMemories = toConsolidate.filter(m => m.type === 'short-term');
      const merged = mergeMemories(shortTermMemories, this.config.associationThreshold);
      
      for (const memory of merged) {
        if (memory.consolidatedFrom && memory.consolidatedFrom.length > 1) {
          memory.type = 'long-term';
          memory.status = 'consolidated';
          result.merged++;
          result.consolidated++;
        } else {
          memory.type = 'long-term';
          memory.status = 'consolidated';
          result.consolidated++;
        }
      }
    } else {
      for (const memory of toConsolidate) {
        memory.type = 'long-term';
        memory.status = 'consolidated';
        result.consolidated++;
      }
    }

    this.logger?.info('Memory consolidation complete', {
      agentId,
      ...result,
    });

    return result;
  }

  /**
   * Create association between memories
   */
  async createAssociation(
    sourceId: string,
    targetId: string,
    type: MemoryAssociation['associationType'] = 'related',
    strength: number = 0.5
  ): Promise<MemoryAssociation> {
    if (!this.memories.has(sourceId) || !this.memories.has(targetId)) {
      throw new Error('Both memories must exist to create association');
    }

    const id = generateAssociationId();
    const association: MemoryAssociation = {
      id,
      sourceMemoryId: sourceId,
      targetMemoryId: targetId,
      associationType: type,
      strength,
      createdAt: new Date(),
    };

    this.associations.set(id, association);
    
    this.logger?.debug('Association created', { sourceId, targetId, type, strength });
    
    return association;
  }

  /**
   * Get memory statistics
   */
  async getStats(agentId?: string): Promise<MemoryStats> {
    let memories = agentId 
      ? this.getMemoriesByAgent(agentId)
      : Array.from(this.memories.values());

    const stats: MemoryStats = {
      totalMemories: memories.length,
      byType: {
        'short-term': 0,
        'long-term': 0,
        'episodic': 0,
        'semantic': 0,
        'working': 0,
      },
      byStatus: {
        'active': 0,
        'archived': 0,
        'forgotten': 0,
        'consolidated': 0,
      },
      byPriority: {
        'low': 0,
        'normal': 0,
        'high': 0,
        'critical': 0,
      },
      averageImportance: 0,
      averageAccessCount: 0,
      totalAssociations: this.associations.size,
      storageSize: 0,
    };

    let totalImportance = 0;
    let totalAccessCount = 0;
    let oldestTime = Infinity;
    let newestTime = 0;

    for (const memory of memories) {
      stats.byType[memory.type]++;
      stats.byStatus[memory.status]++;
      stats.byPriority[memory.priority]++;
      
      totalImportance += memory.metadata.importance;
      totalAccessCount += memory.metadata.accessCount;
      
      const createdTime = memory.metadata.createdAt.getTime();
      if (createdTime < oldestTime) oldestTime = createdTime;
      if (createdTime > newestTime) newestTime = createdTime;
      
      stats.storageSize += memory.content.length;
    }

    if (memories.length > 0) {
      stats.averageImportance = totalImportance / memories.length;
      stats.averageAccessCount = totalAccessCount / memories.length;
      stats.oldestMemory = oldestTime !== Infinity ? new Date(oldestTime) : undefined;
      stats.newestMemory = newestTime !== 0 ? new Date(newestTime) : undefined;
    }

    return stats;
  }

  /**
   * List memories with pagination
   */
  async list(
    filter: MemoryFilter = {},
    sort: MemorySortOptions = { field: 'createdAt', direction: 'desc' },
    page: number = 1,
    pageSize: number = 20
  ): Promise<MemoryListResult> {
    let memories = Array.from(this.memories.values());
    
    memories = filterMemories(memories, filter);
    memories = sortMemories(memories, sort);
    
    return paginateMemories(memories, page, pageSize);
  }

  /**
   * Execute batch operations
   */
  async batch(operations: BatchMemoryOperation[]): Promise<BatchMemoryResult[]> {
    const results: BatchMemoryResult[] = [];

    for (const op of operations) {
      try {
        let result: Memory | MemoryListResult | MemoryConsolidationResult | MemoryRecallResult | null = null;

        switch (op.operation) {
          case 'store':
            if (op.memory) {
              result = await this.store(
                op.memory.agentId ?? 'default',
                op.memory.content ?? '',
                op.memory.type,
                op.memory.priority,
                op.options as MemoryStoreOptions
              );
            }
            break;
          case 'recall':
            result = await this.recall(
              op.filter?.agentId ?? 'default',
              op.filter,
              op.options as MemoryRecallOptions
            );
            break;
          case 'update':
            if (op.memory?.id) {
              result = await this.update(op.memory.id, op.memory);
            }
            break;
          case 'delete':
            if (op.memory?.id) {
              await this.delete(op.memory.id);
            }
            break;
          case 'consolidate':
            result = await this.consolidate(
              op.filter?.agentId ?? 'default',
              op.options as MemoryConsolidationOptions
            );
            break;
        }

        results.push({
          operation: op.operation,
          success: true,
          result: result ?? undefined,
        });
      } catch (error) {
        results.push({
          operation: op.operation,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Start automatic consolidation
   */
  startAutoConsolidation(agentId: string): void {
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
    }

    this.consolidationTimer = setInterval(async () => {
      try {
        await this.consolidate(agentId);
      } catch (error) {
        this.logger?.error('Auto-consolidation failed', { error });
      }
    }, this.config.consolidationInterval);

    this.logger?.info('Auto-consolidation started', { agentId });
  }

  /**
   * Stop automatic consolidation
   */
  stopAutoConsolidation(): void {
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
      this.consolidationTimer = undefined;
      this.logger?.info('Auto-consolidation stopped');
    }
  }

  /**
   * Get a single memory by ID
   */
  async get(memoryId: string): Promise<Memory | null> {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      return null;
    }
    return updateAccessStats(memory);
  }

  /**
   * Clear all memories for an agent
   */
  async clearAgent(agentId: string): Promise<number> {
    const memoryIds = this.agentMemories.get(agentId);
    if (!memoryIds) {
      return 0;
    }

    const count = memoryIds.size;
    
    for (const id of memoryIds) {
      this.memories.delete(id);
    }
    
    this.agentMemories.delete(agentId);

    this.logger?.info('Agent memories cleared', { agentId, count });
    
    return count;
  }

  // Private helper methods

  private getMemoriesByAgent(agentId: string): Memory[] {
    const ids = this.agentMemories.get(agentId);
    if (!ids) {
      return [];
    }
    return Array.from(ids)
      .map(id => this.memories.get(id))
      .filter((m): m is Memory => m !== undefined);
  }

  private getAssociationsForMemories(memoryIds: string[]): MemoryAssociation[] {
    return Array.from(this.associations.values()).filter(
      assoc => memoryIds.includes(assoc.sourceMemoryId) || memoryIds.includes(assoc.targetMemoryId)
    );
  }

  private async enforceMemoryLimits(agentId: string, type: MemoryType): Promise<void> {
    const memories = this.getMemoriesByAgent(agentId).filter(m => m.type === type);
    
    let limit: number;
    switch (type) {
      case 'short-term':
        limit = this.config.maxShortTermMemories;
        break;
      case 'working':
        limit = this.config.maxWorkingMemories;
        break;
      default:
        limit = this.config.maxLongTermMemories;
    }

    if (memories.length > limit) {
      memories.sort((a, b) => a.metadata.importance - b.metadata.importance);
      
      const toRemove = memories.slice(0, memories.length - limit);
      for (const memory of toRemove) {
        if (memory.metadata.importance < this.config.importanceThreshold) {
          await this.delete(memory.id);
        } else {
          memory.status = 'archived';
        }
      }
    }
  }
}

// Singleton instance
let memoryServiceInstance: MemoryService | null = null;

/**
 * Create a new memory service instance
 */
export function createMemoryService(options: MemorySkillOptions = {}): MemoryService {
  return new MemoryService(options);
}

/**
 * Get the singleton memory service instance
 */
export function getMemoryService(): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService();
  }
  return memoryServiceInstance;
}

/**
 * Reset the singleton memory service instance
 */
export function resetMemoryService(): void {
  if (memoryServiceInstance) {
    memoryServiceInstance.stopAutoConsolidation();
  }
  memoryServiceInstance = null;
}
