/**
 * Safety Layer
 * Public API for content safety, filtering, and moderation
 */

export * from './types.js';
export * from './utils.js';
export * from './service.js';

import type { SafetyConfig } from './types.js';
import { SafetyService, createSafetyService, getSafetyService, resetSafetyService } from './service.js';

let initialized = false;

export function initializeSafety(config?: Partial<SafetyConfig>): SafetyService {
  if (initialized) {
    return getSafetyService();
  }
  
  const service = createSafetyService(config);
  initialized = true;
  
  return service;
}

export function getSafety(): SafetyService {
  return getSafetyService();
}

export function resetSafety(): void {
  resetSafetyService();
  initialized = false;
}

export { SafetyService };