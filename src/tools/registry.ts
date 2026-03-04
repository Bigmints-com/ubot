/**
 * Tool Module Registry
 *
 * Auto-discovers tool modules from capability directories.
 * Each capability is a plug-and-play mini-app:
 *   1. Create a directory under capabilities/, agents/, or automation/
 *   2. Add an index.ts that exports `toolModules: ToolModule[]`
 *   3. The registry discovers and registers them automatically
 *
 * Infrastructure modules (channels, memory, engine) are registered explicitly.
 */

import fs from 'fs';
import path from 'path';
import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from './types.js';
import { loadAllCustomModules, getLoadedModules, getLoadedToolModules, setCoreToolNames } from '../capabilities/cli/custom-loader.js';

// Infrastructure tool modules (not auto-discovered — these are core plumbing)
import messagingTools from '../channels/tools.js';
import memoryTools from '../memory/tools.js';
import sessionsTools from '../engine/session-tools.js';

const INFRASTRUCTURE_MODULES: ToolModule[] = [
  messagingTools,
  memoryTools,
  sessionsTools,
];

// Directories to scan for plug-and-play modules
const SCAN_DIRS = ['capabilities', 'agents', 'automation'];

// Browser is disabled — MCP Playwright is preferred
const DISABLED_MODULES = new Set(['browser']);

let _discoveredModules: ToolModule[] | null = null;

/**
 * Discover tool modules by scanning capability directories.
 * Each directory with an index.ts that exports `toolModules` is registered.
 */
export async function discoverToolModules(): Promise<ToolModule[]> {
  if (_discoveredModules) return _discoveredModules;

  const srcDir = path.dirname(__dirname);
  const modules: ToolModule[] = [];

  for (const scanDir of SCAN_DIRS) {
    const fullPath = path.join(srcDir, scanDir);
    if (!fs.existsSync(fullPath)) continue;

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (DISABLED_MODULES.has(entry.name)) {
        console.log(`[Tools] Skipping disabled module: ${scanDir}/${entry.name}`);
        continue;
      }

      const indexJs = path.join(fullPath, entry.name, 'index.js');
      const indexTs = path.join(fullPath, entry.name, 'index.ts');
      const indexPath = fs.existsSync(indexJs) ? indexJs : fs.existsSync(indexTs) ? indexTs : null;
      if (!indexPath) continue;

      try {
        const mod = await import(indexPath);
        if (mod.toolModules && Array.isArray(mod.toolModules)) {
          modules.push(...mod.toolModules);
          console.log(`[Tools] Discovered: ${scanDir}/${entry.name} (${mod.toolModules.length} module(s))`);
        }
      } catch (err: any) {
        console.warn(`[Tools] Failed to load ${scanDir}/${entry.name}: ${err.message}`);
      }
    }
  }

  _discoveredModules = modules;
  return modules;
}

/**
 * Get all modules: discovered + infrastructure + custom.
 */
async function getAllModules(): Promise<ToolModule[]> {
  const discovered = await discoverToolModules();
  return [...INFRASTRUCTURE_MODULES, ...discovered];
}

/**
 * Collect all tool definitions from all modules (core + custom).
 */
export async function getAllToolDefinitions(): Promise<ToolDefinition[]> {
  const allModules = await getAllModules();
  const customTools = getLoadedToolModules().flatMap(m => m.tools);
  return [...allModules.flatMap(m => m.tools), ...customTools];
}

/**
 * Collect all tool definitions along with their source module name (core + custom).
 */
export async function getAllToolsWithModules(): Promise<Array<{ module: string; tool: ToolDefinition }>> {
  const allModules = await getAllModules();
  const core = allModules.flatMap(m => m.tools.map(tool => ({ module: m.name, tool })));
  const custom = getLoadedToolModules().flatMap(m => 
    m.tools.map(tool => ({ module: `custom:${m.name}`, tool }))
  );
  return [...core, ...custom];
}

/**
 * Register all tool executors from all modules.
 */
export async function registerAllToolModules(registry: ToolRegistry, ctx: ToolContext): Promise<void> {
  const allModules = await getAllModules();
  for (const mod of allModules) {
    console.log(`[Tools] Registering module: ${mod.name} (${mod.tools.length} tools)`);
    mod.register(registry, ctx);
  }
  const defs = await getAllToolDefinitions();
  console.log(`[Tools] All modules registered (${defs.length} tools total)`);
}

/**
 * Get module names.
 */
export async function getModuleNames(): Promise<string[]> {
  const allModules = await getAllModules();
  return allModules.map(m => m.name);
}

/**
 * Register custom modules from custom/modules/ directory.
 * Called at startup after core modules are registered.
 */
export async function registerCustomModules(registry: ToolRegistry, ctx: ToolContext): Promise<void> {
  const defs = await getAllToolDefinitions();
  setCoreToolNames(defs.map(t => t.name));
  
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
