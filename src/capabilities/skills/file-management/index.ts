/**
 * File Management Skill Module
 * Exports types, utilities, and service for file management operations
 */

export * from './types.js';
export * from './utils.js';
export * from './service.js';

import { FileManagementService, createFileManagementService, getFileManagementService, resetFileManagementService } from './service.js';
import type { FileManagementConfig } from './types.js';
import type { LoggerInstance } from '../../../logger/types.js';

export type { FileManagementConfig } from './types.js';

/**
 * Initialize file management skill
 */
export async function initializeFileManagement(
  config?: Partial<FileManagementConfig>,
  logger?: LoggerInstance
): Promise<FileManagementService> {
  const service = createFileManagementService(config, logger);
  await service.initialize();
  return service;
}

/**
 * Get file management service
 */
export function getFileManagement(): FileManagementService | null {
  return getFileManagementService();
}

/**
 * Reset file management service
 */
export function resetFileManagement(): void {
  resetFileManagementService();
}

export { FileManagementService, createFileManagementService };