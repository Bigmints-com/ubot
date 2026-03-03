/**
 * Tool Module Registry
 *
 * Loads all tool modules and provides a unified interface.
 * Each service owns its own tools.ts — this registry just collects them.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from './types.js';
import { loadAllCustomModules, getLoadedModules, getLoadedToolModules, setCoreToolNames } from '../capabilities/cli/custom-loader.js';

// Import each service's tool module from its own directory
import googleTools from './google.js';
import messagingTools from './messaging.js';
import skillsTools from './skills.js';
import browserTools from './browser.js';
import schedulerTools from './scheduler.js';
import approvalsTools from './approvals.js';
import webSearchTools from './web-search.js';
import webFetchTools from './web-fetch.js';
import memoryTools from './memory.js';
import filesTools from './files.js';
import cliTools from './cli.js';
import mediaTools from './media.js';
import vaultTools from './vault.js';
import execTools from './exec.js';
import patchTools from './patch.js';
import sessionsTools from './sessions.js';
/**
 * All available tool modules, in registration order.
 * Add new modules here.
 */
const ALL_MODULES: ToolModule[] = [
  messagingTools,
  approvalsTools,
  webSearchTools,
  webFetchTools,
  skillsTools,
  browserTools,
  schedulerTools,
  memoryTools,
  filesTools,
  googleTools,
  cliTools,
  mediaTools,
  vaultTools,
  execTools,
  patchTools,
  sessionsTools,
];

/**
 * Collect all tool definitions from all modules (core + custom).
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  const customTools = getLoadedToolModules().flatMap(m => m.tools);
  return [...ALL_MODULES.flatMap(m => m.tools), ...customTools];
}

/**
 * Collect all tool definitions along with their source module name (core + custom).
 */
export function getAllToolsWithModules(): Array<{ module: string; tool: ToolDefinition }> {
  const core = ALL_MODULES.flatMap(m => m.tools.map(tool => ({ module: m.name, tool })));
  const custom = getLoadedToolModules().flatMap(m => 
    m.tools.map(tool => ({ module: `custom:${m.name}`, tool }))
  );
  return [...core, ...custom];
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

/**
 * Register custom modules from custom/modules/ directory.
 * Called at startup after core modules are registered.
 */
export async function registerCustomModules(registry: ToolRegistry, ctx: ToolContext): Promise<void> {
  // Set core tool names so custom modules can't override them
  setCoreToolNames(getAllToolDefinitions().map(t => t.name));
  
  const result = await loadAllCustomModules(registry, ctx);
  if (result.loaded.length > 0) {
    console.log(`[Tools] Custom modules loaded: ${result.loaded.join(', ')}`);
  }
  if (result.failed.length > 0) {
    console.warn(`[Tools] Custom modules failed: ${result.failed.map(f => f.name).join(', ')}`);
  }
}

/**
 * Get names of loaded custom modules.
 */
export function getCustomModuleNames(): string[] {
  return getLoadedModules().map(m => m.name);
}
