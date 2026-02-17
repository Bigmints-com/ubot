import type { LoggerInstance } from '../../logger/types.js';

/**
 * Memory types for the Memory Skill
 */

export type MemoryType = 'short-term' | 'long-term' | 'episodic' | 'semantic' | 'working';

export type MemoryPriority = 'low' | 'normal' | 'high' | 'critical';

export type MemoryStatus = 'active' | 'archived' | 'forgotten' | 'consolidated';

export interface MemoryMetadata {
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  source: string;
  tags: string[];
  confidence: number;
  importance: number;
}

export interface Memory {
  id: string;
  agentId: string;
  type: MemoryType;
  priority: MemoryPriority;
  status: MemoryStatus;
  content: string;
  embedding?: number[];
  context?: Record<string, unknown>;
  metadata: MemoryMetadata;
  expiresAt?: Date;
  consolidatedFrom?: string[];
}

export interface MemoryAssociation {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  associationType: 'related' | 'causes' | 'follows' | 'contradicts' | 'supports';
  strength: number;
  createdAt: Date;
}

export interface MemoryFilter {
  agentId?: string;
  types?: MemoryType[];
  priorities?: MemoryPriority[];
  statuses?: MemoryStatus[];
  tags?: string[];
  searchQuery?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minImportance?: number;
  maxImportance?: number;
}

export interface MemorySortOptions {
  field: 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'importance' | 'accessCount';
  direction: 'asc' | 'desc';
}

export interface MemoryListResult {
  memories: Memory[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface MemoryStoreOptions {
  generateEmbedding?: boolean;
  associateWith?: string[];
  ttl?: number;
  overwrite?: boolean;
}

export interface MemoryRecallOptions {
  limit?: number;
  threshold?: number;
  includeAssociations?: boolean;
  includeContext?: boolean;
  sortByRelevance?: boolean;
}

export interface MemoryRecallResult {
  memories: Memory[];
  associations: MemoryAssociation[];
  totalRecalled: number;
  recallAccuracy: number;
}

export interface MemoryConsolidationOptions {
  maxAge?: number;
  minAccessCount?: number;
  preserveHighImportance?: boolean;
  mergeSimilar?: boolean;
}

export interface MemoryConsolidationResult {
  consolidated: number;
  archived: number;
  forgotten: number;
  merged: number;
  errors: string[];
}

export interface MemorySearchOptions {
  query: string;
  useEmbedding?: boolean;
  fuzzyMatch?: boolean;
  maxDistance?: number;
  includeMetadata?: boolean;
}

export interface MemorySearchResult {
  memories: Memory[];
  matches: MemorySearchMatch[];
  totalMatches: number;
  searchTime: number;
}

export interface MemorySearchMatch {
  memoryId: string;
  snippet: string;
  score: number;
  matchType: 'exact' | 'fuzzy' | 'semantic';
  positions: number[];
}

export interface MemoryStats {
  totalMemories: number;
  byType: Record<MemoryType, number>;
  byStatus: Record<MemoryStatus, number>;
  byPriority: Record<MemoryPriority, number>;
  averageImportance: number;
  averageAccessCount: number;
  oldestMemory?: Date;
  newestMemory?: Date;
  totalAssociations: number;
  storageSize: number;
}

export interface MemoryManagementConfig {
  maxShortTermMemories: number;
  maxLongTermMemories: number;
  maxWorkingMemories: number;
  defaultTTL: number;
  consolidationInterval: number;
  embeddingDimension: number;
  importanceThreshold: number;
  forgettingThreshold: number;
  associationThreshold: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryManagementConfig = {
  maxShortTermMemories: 100,
  maxLongTermMemories: 10000,
  maxWorkingMemories: 50,
  defaultTTL: 86400000,
  consolidationInterval: 3600000,
  embeddingDimension: 1536,
  importanceThreshold: 0.5,
  forgettingThreshold: 0.1,
  associationThreshold: 0.7,
};

export interface MemorySkillOptions {
  config?: Partial<MemoryManagementConfig>;
  logger?: LoggerInstance;
  dbConnection?: unknown;
}

export interface BatchMemoryOperation {
  operation: 'store' | 'recall' | 'update' | 'delete' | 'consolidate';
  memory?: Partial<Memory>;
  filter?: MemoryFilter;
  options?: MemoryStoreOptions | MemoryRecallOptions | MemoryConsolidationOptions;
}

export interface BatchMemoryResult {
  operation: string;
  success: boolean;
  result?: Memory | MemoryListResult | MemoryConsolidationResult | MemoryRecallResult;
  error?: string;
}

export const MEMORY_SKILL = {
  id: 'memory-skill',
  name: 'Memory Skill',
  description: 'Manages agent memory including storage, recall, consolidation, and association of memories',
  category: 'cognitive' as const,
  level: 'intermediate' as const,
  tags: ['memory', 'cognitive', 'storage', 'recall', 'learning'],
  capabilities: [
    'store_memory',
    'recall_memory',
    'search_memory',
    'consolidate_memory',
    'associate_memories',
    'forget_memory',
    'get_memory_stats',
  ],
};
