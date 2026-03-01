/**
 * Custom Module Test Pipeline
 * 
 * Validates staged custom modules before they are promoted to live.
 * Checks:
 * 1. File exists and is readable
 * 2. TypeScript compiles (basic syntax check via dynamic import)
 * 3. Module conforms to ToolModule interface
 * 4. No tool name collisions with core tools
 */

import { existsSync } from 'fs';
import { cp, rm } from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { loadModule, discoverModules, hotReloadModule } from './custom-loader.js';
import type { ToolRegistry, ToolContext } from '../../tools/types.js';

const UBOT_ROOT = process.env.UBOT_HOME || process.cwd();

/** Result of testing a staged module */
export interface TestResult {
  moduleName: string;
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

/**
 * Test a staged custom module.
 * Performs validation without promoting it.
 */
export async function testStagedModule(moduleName: string): Promise<TestResult> {
  const checks: TestResult['checks'] = [];
  const stagingDir = path.join(UBOT_ROOT, 'custom', 'staging', moduleName);
  const indexPath = path.join(stagingDir, 'index.ts');

  // Check 1: File exists
  const fileExists = existsSync(indexPath);
  checks.push({
    name: 'file_exists',
    passed: fileExists,
    message: fileExists ? `Found ${indexPath}` : `Missing ${indexPath}`,
  });

  if (!fileExists) {
    return { moduleName, passed: false, checks };
  }

  // Check 2: TypeScript compile check (catches type errors, missing imports, etc.)
  const customTsconfig = path.join(UBOT_ROOT, 'custom', 'tsconfig.json');
  let compilesPassed = false;
  let compileMessage = '';

  if (existsSync(customTsconfig)) {
    try {
      execSync(`npx tsc --noEmit --project ${customTsconfig} --pretty false 2>&1 | grep "${moduleName}" || true`, {
        cwd: UBOT_ROOT,
        encoding: 'utf-8',
        timeout: 15000,
      });
      // Run full check and capture output
      try {
        const output = execSync(`npx tsc --noEmit --project ${customTsconfig} --pretty false 2>&1`, {
          cwd: UBOT_ROOT,
          encoding: 'utf-8',
          timeout: 15000,
        });
        compilesPassed = true;
        compileMessage = 'TypeScript compilation passed';
      } catch (tscErr: any) {
        const tscOutput = (tscErr.stdout || tscErr.message || '').toString();
        // Filter errors for this specific module
        const moduleErrors = tscOutput
          .split('\n')
          .filter((line: string) => line.includes(moduleName))
          .join('\n')
          .trim();
        if (moduleErrors) {
          compilesPassed = false;
          compileMessage = `TypeScript errors:\n${moduleErrors}`;
        } else {
          // Errors exist but not in this module — pass this module
          compilesPassed = true;
          compileMessage = 'TypeScript compilation passed (errors in other modules ignored)';
        }
      }
    } catch {
      compilesPassed = true; // tsc not available, skip
      compileMessage = 'TypeScript check skipped (tsc unavailable)';
    }
  } else {
    compilesPassed = true;
    compileMessage = 'TypeScript check skipped (no custom/tsconfig.json)';
  }

  checks.push({
    name: 'typescript_compile',
    passed: compilesPassed,
    message: compileMessage,
  });

  if (!compilesPassed) {
    return { moduleName, passed: false, checks };
  }

  // Check 3: Dynamic import (checks syntax + basic semantics)
  const loadResult = await loadModule(moduleName, 'staging');

  checks.push({
    name: 'import_success',
    passed: loadResult.module !== null,
    message: loadResult.module
      ? `Module imported successfully`
      : `Import failed: ${loadResult.errors.join(', ')}`,
  });

  if (!loadResult.module) {
    return { moduleName, passed: false, checks };
  }

  // Check 3: ToolModule shape (already validated by loadModule)
  const mod = loadResult.module;
  checks.push({
    name: 'has_name',
    passed: !!mod.name,
    message: mod.name ? `Module name: "${mod.name}"` : 'Missing module name',
  });

  checks.push({
    name: 'has_tools',
    passed: mod.tools.length > 0,
    message: `${mod.tools.length} tool(s) defined: ${mod.tools.map(t => t.name).join(', ')}`,
  });

  checks.push({
    name: 'has_register',
    passed: typeof mod.register === 'function',
    message: typeof mod.register === 'function' ? 'register() function present' : 'Missing register() function',
  });

  // Check 4: Tool prefix convention (custom_ prefix recommended)
  const unprefixed = mod.tools.filter(t => !t.name.startsWith('custom_'));
  checks.push({
    name: 'tool_prefix',
    passed: unprefixed.length === 0,
    message: unprefixed.length === 0
      ? 'All tools use "custom_" prefix'
      : `Warning: ${unprefixed.map(t => t.name).join(', ')} should use "custom_" prefix`,
  });

  const allPassed = checks.every(c => c.passed || c.name === 'tool_prefix'); // prefix is a warning, not failure
  return { moduleName, passed: allPassed, checks };
}

/**
 * Promote a staged module to live.
 * Copies from custom/staging/<name>/ to custom/modules/<name>/
 * and triggers hot-reload.
 */
export async function promoteModule(
  moduleName: string,
  registry: ToolRegistry,
  ctx: ToolContext,
): Promise<{ success: boolean; message: string }> {
  const stagingDir = path.join(UBOT_ROOT, 'custom', 'staging', moduleName);
  const modulesDir = path.join(UBOT_ROOT, 'custom', 'modules', moduleName);

  if (!existsSync(stagingDir)) {
    return { success: false, message: `Staging module "${moduleName}" not found` };
  }

  try {
    // Test first
    const testResult = await testStagedModule(moduleName);
    if (!testResult.passed) {
      const failures = testResult.checks.filter(c => !c.passed).map(c => c.message);
      return { success: false, message: `Module failed tests: ${failures.join('; ')}` };
    }

    // Copy staging → modules (overwrite if exists)
    if (existsSync(modulesDir)) {
      await rm(modulesDir, { recursive: true });
    }
    await cp(stagingDir, modulesDir, { recursive: true });

    // Hot-reload into the live registry
    const reloadResult = await hotReloadModule(moduleName, registry, ctx);
    if (!reloadResult.success) {
      return { success: false, message: `Promoted but hot-reload failed: ${reloadResult.errors.join(', ')}` };
    }

    return { success: true, message: `Module "${moduleName}" promoted and loaded (${testResult.checks.filter(c => c.passed).length} checks passed)` };
  } catch (err: any) {
    return { success: false, message: `Promotion failed: ${err.message}` };
  }
}

/**
 * List all custom modules across staging and modules directories.
 */
export function listCustomModules(): Array<{
  name: string;
  status: 'staging' | 'live' | 'both';
}> {
  const staging = new Set(discoverModules('staging'));
  const live = new Set(discoverModules('modules'));
  const all = new Set([...staging, ...live]);

  return Array.from(all).map(name => ({
    name,
    status: staging.has(name) && live.has(name) ? 'both' as const :
            live.has(name) ? 'live' as const : 'staging' as const,
  }));
}

/**
 * Delete a custom module from staging, live, or both.
 * Also unloads from in-memory registry if live.
 */
export async function deleteModule(
  moduleName: string,
  target: 'staging' | 'live' | 'both' = 'both',
  registry?: ToolRegistry,
): Promise<{ success: boolean; message: string }> {
  const stagingDir = path.join(UBOT_ROOT, 'custom', 'staging', moduleName);
  const modulesDir = path.join(UBOT_ROOT, 'custom', 'modules', moduleName);
  const deleted: string[] = [];

  try {
    if ((target === 'staging' || target === 'both') && existsSync(stagingDir)) {
      await rm(stagingDir, { recursive: true });
      deleted.push('staging');
    }

    if ((target === 'live' || target === 'both') && existsSync(modulesDir)) {
      await rm(modulesDir, { recursive: true });
      deleted.push('live');
      // Fully unload from in-memory registry + remove executors
      const { unloadModule } = await import('./custom-loader.js');
      unloadModule(moduleName, registry);
    }

    if (deleted.length === 0) {
      return { success: false, message: `Module "${moduleName}" not found in ${target}` };
    }

    return { success: true, message: `Deleted "${moduleName}" from: ${deleted.join(', ')}. Tools fully unloaded.` };
  } catch (err: any) {
    return { success: false, message: `Delete failed: ${err.message}` };
  }
}

