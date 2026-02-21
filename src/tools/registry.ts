/**
 * Tool Module Registry
 *
 * Loads all tool modules and provides a unified interface.
 * Each service owns its own tools.ts — this registry just collects them.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from './types.js';

// Import each service's tool module from its own directory
import googleTools from './google.js';
import saveadayTools from './saveaday.js';
import messagingTools from './messaging.js';
import skillsTools from './skills.js';
import browserTools from './browser.js';
import schedulerTools from './scheduler.js';
import approvalsTools from './approvals.js';
import webSearchTools from './web-search.js';
import antigravityTools from './antigravity.js';

/**
 * All available tool modules, in registration order.
 * Add new modules here.
 */
const ALL_MODULES: ToolModule[] = [
  messagingTools,
  approvalsTools,
  webSearchTools,
  skillsTools,
  browserTools,
  schedulerTools,
  googleTools,
  saveadayTools,
  antigravityTools,
];

/**
 * Collect all tool definitions from all modules.
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return ALL_MODULES.flatMap(m => m.tools);
}

/**
 * Register all tool executors from all modules.
 */
export function registerAllToolModules(registry: ToolRegistry, ctx: ToolContext): void {
  for (const mod of ALL_MODULES) {
    console.log(`[Tools] Registering module: ${mod.name} (${mod.tools.length} tools)`);
    mod.register(registry, ctx);
  }
  console.log(`[Tools] All ${ALL_MODULES.length} modules registered (${getAllToolDefinitions().length} tools total)`);
}

/**
 * Get module names.
 */
export function getModuleNames(): string[] {
  return ALL_MODULES.map(m => m.name);
}
