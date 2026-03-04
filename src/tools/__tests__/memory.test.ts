import { describe, it, expect } from 'vitest';
import memoryModule from '../../memory/tools.js';
import { registerModule, createMockContext, createMockAgent } from './test-helpers.js';

describe('Memory Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(memoryModule.name).toBe('personas');
    expect(memoryModule.tools.length).toBe(3);
    expect(memoryModule.tools.map(t => t.name)).toEqual([
      'save_memory', 'get_profile', 'delete_memory',
    ]);
  });

  it('should register all 3 executors', () => {
    const registry = registerModule(memoryModule);
    expect(registry.registeredNames()).toHaveLength(3);
    expect(registry.has('save_memory')).toBe(true);
    expect(registry.has('get_profile')).toBe(true);
    expect(registry.has('delete_memory')).toBe(true);
  });

  it('should have correct parameter definitions', () => {
    const saveMemory = memoryModule.tools.find(t => t.name === 'save_memory');
    expect(saveMemory?.parameters).toHaveLength(4);
    expect(saveMemory?.parameters.find(p => p.name === 'contactId')?.required).toBe(true);
    expect(saveMemory?.parameters.find(p => p.name === 'category')?.required).toBe(true);
    expect(saveMemory?.parameters.find(p => p.name === 'key')?.required).toBe(true);
    expect(saveMemory?.parameters.find(p => p.name === 'value')?.required).toBe(true);

    const getProfile = memoryModule.tools.find(t => t.name === 'get_profile');
    expect(getProfile?.parameters).toHaveLength(1);
    expect(getProfile?.parameters[0].name).toBe('contactId');

    const deleteMemory = memoryModule.tools.find(t => t.name === 'delete_memory');
    expect(deleteMemory?.parameters).toHaveLength(1);
    expect(deleteMemory?.parameters[0].name).toBe('memoryId');
  });

  describe('save_memory', () => {
    it('should fail when memory store is null', async () => {
      const registry = registerModule(memoryModule, createMockContext({ allNull: true }));
      const result = await registry.call('save_memory', {
        contactId: '__owner__', category: 'fact', key: 'test', value: 'val',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });

    it('should fail when missing required params', async () => {
      const registry = registerModule(memoryModule);
      const result = await registry.call('save_memory', {
        contactId: '', category: '', key: '', value: '',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing');
    });

    it('should fail with invalid category', async () => {
      const registry = registerModule(memoryModule);
      const result = await registry.call('save_memory', {
        contactId: '__owner__', category: 'invalid_cat', key: 'test', value: 'val',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid category');
    });

    it('should save a memory successfully', async () => {
      const registry = registerModule(memoryModule);
      const result = await registry.call('save_memory', {
        contactId: '__owner__', category: 'fact', key: 'favorite_color', value: 'blue',
      });
      expect(result.success).toBe(true);
      expect(result.result).toContain('Saved memory');
      expect(result.result).toContain('favorite_color');
    });
  });

  describe('get_profile', () => {
    it('should fail when memory store is null', async () => {
      const registry = registerModule(memoryModule, createMockContext({ allNull: true }));
      const result = await registry.call('get_profile', { contactId: '__owner__' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });

    it('should fail when contactId is empty', async () => {
      const registry = registerModule(memoryModule);
      const result = await registry.call('get_profile', { contactId: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('contactId');
    });

    it('should return empty profile message', async () => {
      const registry = registerModule(memoryModule);
      const result = await registry.call('get_profile', { contactId: '__owner__' });
      expect(result.success).toBe(true);
      // Mock returns empty array, so should say "No profile data"
      expect(result.result).toContain('No profile data');
    });
  });

  describe('delete_memory', () => {
    it('should fail when memory store is null', async () => {
      const registry = registerModule(memoryModule, createMockContext({ allNull: true }));
      const result = await registry.call('delete_memory', { memoryId: 'mem-1' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });

    it('should fail when memoryId is empty', async () => {
      const registry = registerModule(memoryModule);
      const result = await registry.call('delete_memory', { memoryId: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('memoryId');
    });

    it('should delete a memory successfully', async () => {
      const registry = registerModule(memoryModule);
      const result = await registry.call('delete_memory', { memoryId: 'mem-1' });
      expect(result.success).toBe(true);
      expect(result.result).toContain('deleted');
    });
  });
});
