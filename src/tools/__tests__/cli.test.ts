import { describe, it, expect } from 'vitest';
import cliModule from '../../capabilities/cli/tools.js';
import { registerModule, createMockContext } from './test-helpers.js';

describe('CLI Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(cliModule.name).toBe('cli');
    expect(cliModule.tools.length).toBe(10);
    expect(cliModule.tools.map(t => t.name)).toEqual([
      'cli_run', 'cli_status', 'cli_stop', 'cli_list_sessions', 'cli_send_input',
      'cli_test_module', 'cli_promote_module', 'cli_list_modules', 'cli_triage', 'cli_delete_module',
    ]);
  });

  it('should register all 10 executors', () => {
    const registry = registerModule(cliModule);
    expect(registry.registeredNames()).toHaveLength(10);
    expect(registry.has('cli_run')).toBe(true);
    expect(registry.has('cli_status')).toBe(true);
    expect(registry.has('cli_stop')).toBe(true);
    expect(registry.has('cli_list_sessions')).toBe(true);
    expect(registry.has('cli_send_input')).toBe(true);
    expect(registry.has('cli_test_module')).toBe(true);
    expect(registry.has('cli_promote_module')).toBe(true);
    expect(registry.has('cli_list_modules')).toBe(true);
    expect(registry.has('cli_triage')).toBe(true);
    expect(registry.has('cli_delete_module')).toBe(true);
  });

  it('should have correct parameter definitions', () => {
    const cliRun = cliModule.tools.find(t => t.name === 'cli_run');
    expect(cliRun?.parameters).toHaveLength(2);
    expect(cliRun?.parameters[0].name).toBe('prompt');
    expect(cliRun?.parameters[0].required).toBe(true);
    expect(cliRun?.parameters[1].name).toBe('project_name');
    expect(cliRun?.parameters[1].required).toBe(false);

    const cliStatus = cliModule.tools.find(t => t.name === 'cli_status');
    expect(cliStatus?.parameters).toHaveLength(2);
    expect(cliStatus?.parameters[0].name).toBe('session_id');
    expect(cliStatus?.parameters[0].required).toBe(true);

    const cliStop = cliModule.tools.find(t => t.name === 'cli_stop');
    expect(cliStop?.parameters).toHaveLength(1);

    const cliList = cliModule.tools.find(t => t.name === 'cli_list_sessions');
    expect(cliList?.parameters).toHaveLength(0);

    const cliInput = cliModule.tools.find(t => t.name === 'cli_send_input');
    expect(cliInput?.parameters).toHaveLength(2);
    expect(cliInput?.parameters[0].name).toBe('session_id');
    expect(cliInput?.parameters[1].name).toBe('input');
  });

  // Note: CLI tools require config.cli.enabled and the CLI binary to be installed,
  // so we test definitions and registration only. Execution tests would require
  // mocking the CliService.

  describe('cli_run', () => {
    it('should return result when CLI service is null', async () => {
      const registry = registerModule(cliModule, createMockContext({ allNull: true }));
      const result = await registry.call('cli_run', { prompt: 'test' });
      // cli_run returns a result (may succeed with startup message or fail gracefully)
      expect(result.toolName).toBe('cli_run');
    });
  });

  describe('cli_status', () => {
    it('should fail when CLI service is null', async () => {
      const registry = registerModule(cliModule, createMockContext({ allNull: true }));
      const result = await registry.call('cli_status', { session_id: 'abc' });
      expect(result.success).toBe(false);
    });
  });

  describe('cli_list_sessions', () => {
    it('should return session list even when CLI service is null', async () => {
      const registry = registerModule(cliModule, createMockContext({ allNull: true }));
      const result = await registry.call('cli_list_sessions');
      // cli_list_sessions returns success with empty session list when service is null
      expect(result.success).toBe(true);
    });
  });
});
