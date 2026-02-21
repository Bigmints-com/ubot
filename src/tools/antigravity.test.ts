import { describe, it, expect } from 'vitest';
import antigravityModule from './antigravity.js';
import { registerModule } from './test-helpers.js';

describe('Antigravity Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(antigravityModule.name).toBe('antigravity');
    expect(antigravityModule.tools.length).toBe(4);
    expect(antigravityModule.tools.map(t => t.name)).toEqual([
      'antigravity_check_queue', 'antigravity_create_queue',
      'antigravity_run_queue', 'antigravity_list_runs',
    ]);
  });

  it('should register all 4 executors', () => {
    const registry = registerModule(antigravityModule);
    expect(registry.registeredNames()).toHaveLength(4);
  });

  it('should have correct parameter definitions', () => {
    const checkQueue = antigravityModule.tools.find(t => t.name === 'antigravity_check_queue');
    expect(checkQueue?.parameters.find(p => p.name === 'path')).toBeTruthy();

    const createQueue = antigravityModule.tools.find(t => t.name === 'antigravity_create_queue');
    expect(createQueue?.parameters.find(p => p.name === 'path')?.required).toBe(true);
    expect(createQueue?.parameters.find(p => p.name === 'prompts')?.required).toBe(true);

    const runQueue = antigravityModule.tools.find(t => t.name === 'antigravity_run_queue');
    expect(runQueue?.parameters.find(p => p.name === 'queue_file')?.required).toBe(true);
    expect(runQueue?.parameters.find(p => p.name === 'dry_run')).toBeTruthy();
  });

  // Note: Antigravity tools execute shell commands (ShellSkill) so we test definitions and registration.
  // Execution tests would require a real antigravity-batch CLI which is an external dependency.
});
