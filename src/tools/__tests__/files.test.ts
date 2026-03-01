import { describe, it, expect } from 'vitest';
import filesModule from '../files.js';
import { createMockRegistry, createMockContext } from './test-helpers.js';

describe('Files Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(filesModule.name).toBe('files');
    expect(filesModule.tools.length).toBe(4);
    expect(filesModule.tools.map(t => t.name)).toEqual([
      'read_file', 'write_file', 'list_files', 'delete_file',
    ]);
  });

  it('should have correct parameter definitions', () => {
    const readFile = filesModule.tools.find(t => t.name === 'read_file');
    expect(readFile?.parameters).toHaveLength(1);
    expect(readFile?.parameters[0].name).toBe('path');
    expect(readFile?.parameters[0].required).toBe(true);

    const writeFile = filesModule.tools.find(t => t.name === 'write_file');
    expect(writeFile?.parameters).toHaveLength(2);
    expect(writeFile?.parameters[0].name).toBe('path');
    expect(writeFile?.parameters[1].name).toBe('content');

    const listFiles = filesModule.tools.find(t => t.name === 'list_files');
    expect(listFiles?.parameters).toHaveLength(1);
    expect(listFiles?.parameters[0].required).toBe(false);

    const deleteFile = filesModule.tools.find(t => t.name === 'delete_file');
    expect(deleteFile?.parameters).toHaveLength(1);
    expect(deleteFile?.parameters[0].required).toBe(true);
  });

  it('should NOT register executors when workspace is null', () => {
    const registry = createMockRegistry();
    const ctx = createMockContext({
      overrides: { getWorkspacePath: () => null },
    });
    filesModule.register(registry, ctx);
    // Files tools should NOT be registered when workspace is unavailable
    expect(registry.registeredNames()).toHaveLength(0);
  });

  it('should register all 4 executors when workspace is available', () => {
    const registry = createMockRegistry();
    const ctx = createMockContext();
    filesModule.register(registry, ctx);
    expect(registry.registeredNames()).toHaveLength(4);
    expect(registry.has('read_file')).toBe(true);
    expect(registry.has('write_file')).toBe(true);
    expect(registry.has('list_files')).toBe(true);
    expect(registry.has('delete_file')).toBe(true);
  });

  describe('read_file', () => {
    it('should handle path traversal errors', async () => {
      const registry = createMockRegistry();
      const ctx = createMockContext();
      filesModule.register(registry, ctx);
      // Attempting to read a path with traversal should be caught by safety
      const result = await registry.call('read_file', { path: '../../etc/passwd' });
      expect(result.success).toBe(false);
    });

    it('should handle non-existent file', async () => {
      const registry = createMockRegistry();
      const ctx = createMockContext();
      filesModule.register(registry, ctx);
      const result = await registry.call('read_file', { path: 'nonexistent-file-abc123.txt' });
      expect(result.success).toBe(false);
    });
  });

  describe('write_file', () => {
    it('should write a file successfully', async () => {
      const registry = createMockRegistry();
      const ctx = createMockContext();
      filesModule.register(registry, ctx);
      const result = await registry.call('write_file', {
        path: '__test_write_temp.txt',
        content: 'hello from test',
      });
      expect(result.success).toBe(true);
      expect(result.result).toContain('Successfully wrote');
    });

    it('should read back written file', async () => {
      const registry = createMockRegistry();
      const ctx = createMockContext();
      filesModule.register(registry, ctx);

      await registry.call('write_file', {
        path: '__test_readback.txt',
        content: 'readback content',
      });
      const result = await registry.call('read_file', { path: '__test_readback.txt' });
      expect(result.success).toBe(true);
      expect(result.result).toBe('readback content');
    });
  });

  describe('list_files', () => {
    it('should list workspace root', async () => {
      const registry = createMockRegistry();
      const ctx = createMockContext();
      filesModule.register(registry, ctx);
      const result = await registry.call('list_files', { path: '' });
      expect(result.success).toBe(true);
    });
  });

  describe('delete_file', () => {
    it('should delete a file', async () => {
      const registry = createMockRegistry();
      const ctx = createMockContext();
      filesModule.register(registry, ctx);

      // Write then delete
      await registry.call('write_file', {
        path: '__test_delete_me.txt',
        content: 'delete me',
      });
      const result = await registry.call('delete_file', { path: '__test_delete_me.txt' });
      expect(result.success).toBe(true);
      expect(result.result).toContain('Successfully deleted');
    });

    it('should fail on non-existent file', async () => {
      const registry = createMockRegistry();
      const ctx = createMockContext();
      filesModule.register(registry, ctx);
      const result = await registry.call('delete_file', { path: 'no-such-file-xyz.txt' });
      expect(result.success).toBe(false);
    });
  });
});
