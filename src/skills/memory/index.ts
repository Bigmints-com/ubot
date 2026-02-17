/**
 * Memory Skill
 * Provides memory management capabilities for agents including
 * storage, recall, consolidation, and association of memories.
 */

export * from './types.js';
export * from './utils.js';
export * from './service.js';

import type { LoggerInstance } from '../../logger/types.js';
import type { MemorySkillOptions, MemoryManagementConfig, Memory } from './types.js';
import { MEMORY_SKILL } from './types.js';
import { MemoryService, createMemoryService, getMemoryService, resetMemoryService } from './service.js';

export interface MemorySkill {
  id: string;
  name: string;
  description: string;
  service: MemoryService;
  capabilities: string[];
}

/**
 * Initialize the memory skill
 */
export function initializeMemory(options: MemorySkillOptions = {}): MemorySkill {
  const service = createMemoryService(options);
  
  return {
    id: MEMORY_SKILL.id,
    name: MEMORY_SKILL.name,
    description: MEMORY_SKILL.description,
    service,
    capabilities: MEMORY_SKILL.capabilities,
  };
}

/**
 * Get the memory skill instance
 */
export function getMemory(): MemorySkill {
  const service = getMemoryService();
  
  return {
    id: MEMORY_SKILL.id,
    name: MEMORY_SKILL.name,
    description: MEMORY_SKILL.description,
    service,
    capabilities: MEMORY_SKILL.capabilities,
  };
}

/**
 * Reset the memory skill
 */
export function resetMemory(): void {
  resetMemoryService();
}

// Re-export service functions for convenience
export { createMemoryService, getMemoryService, resetMemoryService };
export { MemoryService } from './service.js';

// Re-export utility functions
export {
  generateMemoryId,
  generateAssociationId,
  calculateImportance,
  calculateDecayFactor,
  shouldForget,
  shouldConsolidate,
  calculateEmbeddingSimilarity,
  calculateTextSimilarity,
  filterMemories,
  sortMemories,
  paginateMemories,
  createDefaultMetadata,
  updateAccessStats,
  mergeMemories,
  extractAssociations,
  validateMemoryContent,
  validateMemoryType,
  getMemoryTTL,
  formatMemorySummary,
} from './utils.js';

// Default export
export default {
  initializeMemory,
  getMemory,
  resetMemory,
  MEMORY_SKILL,
};
