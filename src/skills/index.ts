/**
 * Skills Framework
 * Main entry point for skills management and assessment
 */

export * from './types.js';
export { SkillsRepository, createSkillsRepository } from './repository.js';
export { SkillsService, createSkillsService } from './service.js';
export * from './utils.js';

import { SkillsService, createSkillsService } from './service.js';
import type { SkillFrameworkConfig } from './types.js';

/**
 * Database connection interface for the skills framework
 */
export interface DatabaseConnection {
  execute(sql: string, ...params: unknown[]): Promise<unknown>;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
  isOpen(): boolean;
}

let skillsServiceInstance: SkillsService | null = null;

export function initializeSkillsFramework(
  db: DatabaseConnection,
  _config?: Partial<SkillFrameworkConfig>
): SkillsService {
  skillsServiceInstance = createSkillsService(db);
  return skillsServiceInstance;
}

export function getSkillsService(): SkillsService {
  if (!skillsServiceInstance) {
    throw new Error('Skills Framework not initialized. Call initializeSkillsFramework first.');
  }
  return skillsServiceInstance;
}

export function resetSkillsFramework(): void {
  skillsServiceInstance = null;
}