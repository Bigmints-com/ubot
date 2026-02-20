import type {
  Memory,
  MemoryType,
  MemoryPriority,
  MemoryFilter,
  MemorySortOptions,
  MemoryListResult,
  MemoryMetadata,
  MemoryAssociation,
} from './types.js';

/**
 * Generate a unique memory ID
 */
export function generateMemoryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `mem_${timestamp}_${random}`;
}

/**
 * Generate a unique association ID
 */
export function generateAssociationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `assoc_${timestamp}_${random}`;
}

/**
 * Calculate memory importance based on various factors
 */
export function calculateImportance(
  accessCount: number,
  age: number,
  priority: MemoryPriority,
  confidence: number
): number {
  const priorityWeights: Record<MemoryPriority, number> = {
    low: 0.25,
    normal: 0.5,
    high: 0.75,
    critical: 1.0,
  };

  const recencyFactor = Math.exp(-age / (7 * 24 * 60 * 60 * 1000));
  const frequencyFactor = Math.min(1, accessCount / 10);
  const priorityFactor = priorityWeights[priority];

  return (recencyFactor * 0.3 + frequencyFactor * 0.3 + priorityFactor * 0.2 + confidence * 0.2);
}

/**
 * Calculate memory decay factor
 */
export function calculateDecayFactor(
  lastAccessedAt: Date,
  decayRate: number = 0.1
): number {
  const now = Date.now();
  const lastAccessed = lastAccessedAt.getTime();
  const timeDiff = now - lastAccessed;
  const daysSinceAccess = timeDiff / (24 * 60 * 60 * 1000);
  
  return Math.exp(-decayRate * daysSinceAccess);
}

/**
 * Check if memory should be forgotten
 */
export function shouldForget(
  memory: Memory,
  threshold: number = 0.1
): boolean {
  if (memory.status === 'forgotten') return true;
  
  const decayFactor = calculateDecayFactor(memory.metadata.lastAccessedAt);
  const effectiveImportance = memory.metadata.importance * decayFactor;
  
  return effectiveImportance < threshold;
}

/**
 * Check if memory should be consolidated
 */
export function shouldConsolidate(
  memory: Memory,
  minAccessCount: number = 3,
  minAge: number = 3600000
): boolean {
  if (memory.type === 'long-term' || memory.status === 'consolidated') {
    return false;
  }
  
  const age = Date.now() - memory.metadata.createdAt.getTime();
  
  return memory.metadata.accessCount >= minAccessCount && age >= minAge;
}

/**
 * Calculate similarity between two memory embeddings
 */
export function calculateEmbeddingSimilarity(
  embedding1: number[],
  embedding2: number[]
): number {
  if (embedding1.length !== embedding2.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }
  
  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Calculate text similarity using simple token overlap
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(text1.toLowerCase().split(/\s+/));
  const tokens2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Filter memories based on criteria
 */
export function filterMemories(
  memories: Memory[],
  filter: MemoryFilter
): Memory[] {
  return memories.filter(memory => {
    if (filter.agentId && memory.agentId !== filter.agentId) return false;
    if (filter.types && filter.types.length > 0 && !filter.types.includes(memory.type)) return false;
    if (filter.priorities && filter.priorities.length > 0 && !filter.priorities.includes(memory.priority)) return false;
    if (filter.statuses && filter.statuses.length > 0 && !filter.statuses.includes(memory.status)) return false;
    if (filter.tags && filter.tags.length > 0) {
      const hasTag = filter.tags.some(tag => memory.metadata.tags.includes(tag));
      if (!hasTag) return false;
    }
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      const contentMatch = memory.content.toLowerCase().includes(query);
      const tagMatch = memory.metadata.tags.some(tag => tag.toLowerCase().includes(query));
      if (!contentMatch && !tagMatch) return false;
    }
    if (filter.dateFrom && memory.metadata.createdAt < filter.dateFrom) return false;
    if (filter.dateTo && memory.metadata.createdAt > filter.dateTo) return false;
    if (filter.minImportance !== undefined && memory.metadata.importance < filter.minImportance) return false;
    if (filter.maxImportance !== undefined && memory.metadata.importance > filter.maxImportance) return false;
    
    return true;
  });
}

/**
 * Sort memories based on options
 */
export function sortMemories(
  memories: Memory[],
  sort: MemorySortOptions
): Memory[] {
  const sorted = [...memories].sort((a, b) => {
    let valueA: number;
    let valueB: number;
    
    switch (sort.field) {
      case 'createdAt':
        valueA = a.metadata.createdAt.getTime();
        valueB = b.metadata.createdAt.getTime();
        break;
      case 'updatedAt':
        valueA = a.metadata.updatedAt.getTime();
        valueB = b.metadata.updatedAt.getTime();
        break;
      case 'lastAccessedAt':
        valueA = a.metadata.lastAccessedAt.getTime();
        valueB = b.metadata.lastAccessedAt.getTime();
        break;
      case 'importance':
        valueA = a.metadata.importance;
        valueB = b.metadata.importance;
        break;
      case 'accessCount':
        valueA = a.metadata.accessCount;
        valueB = b.metadata.accessCount;
        break;
      default:
        return 0;
    }
    
    return sort.direction === 'asc' ? valueA - valueB : valueB - valueA;
  });
  
  return sorted;
}

/**
 * Paginate memories
 */
export function paginateMemories(
  memories: Memory[],
  page: number,
  pageSize: number
): MemoryListResult {
  const total = memories.length;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedMemories = memories.slice(startIndex, endIndex);
  
  return {
    memories: paginatedMemories,
    total,
    page,
    pageSize,
    hasMore: endIndex < total,
  };
}

/**
 * Create default memory metadata
 */
export function createDefaultMetadata(): MemoryMetadata {
  const now = new Date();
  return {
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    source: 'user',
    tags: [],
    confidence: 1.0,
    importance: 0.5,
  };
}

/**
 * Update memory access statistics
 */
export function updateAccessStats(memory: Memory): Memory {
  return {
    ...memory,
    metadata: {
      ...memory.metadata,
      lastAccessedAt: new Date(),
      accessCount: memory.metadata.accessCount + 1,
    },
  };
}

/**
 * Merge similar memories
 */
export function mergeMemories(
  memories: Memory[],
  threshold: number = 0.8
): Memory[] {
  if (memories.length <= 1) return memories;
  
  const merged: Memory[] = [];
  const used = new Set<string>();
  
  for (const memory of memories) {
    if (used.has(memory.id)) continue;
    
    const similar: Memory[] = [memory];
    used.add(memory.id);
    
    for (const other of memories) {
      if (used.has(other.id)) continue;
      
      const similarity = memory.embedding && other.embedding
        ? calculateEmbeddingSimilarity(memory.embedding, other.embedding)
        : calculateTextSimilarity(memory.content, other.content);
      
      if (similarity >= threshold) {
        similar.push(other);
        used.add(other.id);
      }
    }
    
    if (similar.length > 1) {
      const mergedMemory: Memory = {
        ...memory,
        content: similar.map(m => m.content).join('\n---\n'),
        metadata: {
          ...memory.metadata,
          importance: Math.max(...similar.map(m => m.metadata.importance)),
          accessCount: similar.reduce((sum, m) => sum + m.metadata.accessCount, 0),
          tags: [...new Set(similar.flatMap(m => m.metadata.tags))],
        },
        consolidatedFrom: similar.map(m => m.id),
      };
      merged.push(mergedMemory);
    } else {
      merged.push(memory);
    }
  }
  
  return merged;
}

/**
 * Extract memory associations from content
 */
export function extractAssociations(
  memories: Memory[],
  threshold: number = 0.5
): MemoryAssociation[] {
  const associations: MemoryAssociation[] = [];
  
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const similarity = memories[i].embedding && memories[j].embedding
        ? calculateEmbeddingSimilarity(memories[i].embedding!, memories[j].embedding!)
        : calculateTextSimilarity(memories[i].content, memories[j].content);
      
      if (similarity >= threshold) {
        associations.push({
          id: generateAssociationId(),
          sourceMemoryId: memories[i].id,
          targetMemoryId: memories[j].id,
          associationType: 'related',
          strength: similarity,
          createdAt: new Date(),
        });
      }
    }
  }
  
  return associations;
}

/**
 * Validate memory content
 */
export function validateMemoryContent(content: string): { valid: boolean; error?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Memory content cannot be empty' };
  }
  if (content.length > 100000) {
    return { valid: false, error: 'Memory content exceeds maximum length (100000 characters)' };
  }
  return { valid: true };
}

/**
 * Validate memory type
 */
export function validateMemoryType(type: string): { valid: boolean; error?: string } {
  const validTypes: MemoryType[] = ['short-term', 'long-term', 'episodic', 'semantic', 'working'];
  if (!validTypes.includes(type as MemoryType)) {
    return { valid: false, error: `Invalid memory type: ${type}` };
  }
  return { valid: true };
}

/**
 * Get memory type TTL
 */
export function getMemoryTTL(type: MemoryType): number {
  const ttls: Record<MemoryType, number> = {
    'short-term': 3600000,
    'working': 1800000,
    'episodic': 604800000,
    'semantic': 31536000000,
    'long-term': 31536000000,
  };
  return ttls[type];
}

/**
 * Format memory for display
 */
export function formatMemorySummary(memory: Memory): string {
  const preview = memory.content.length > 100
    ? memory.content.substring(0, 100) + '...'
    : memory.content;
  
  return `[${memory.type}] ${memory.id}: ${preview}`;
}
