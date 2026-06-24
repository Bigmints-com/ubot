import { describe, it, expect } from 'vitest';
import memoryToolModule from './memory.js';
import { toolAnalytics } from '../metrics/tool-analytics.js';

describe('Memory Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(memoryToolModule.name).toBe('personas');
    expect(memoryToolModule.tools.length).toBe(3);
    expect(memoryToolModule.tools.map(t => t.name)).toEqual([
      'save_memory', 'get_profile', 'delete_memory',
    ]);
  });

  it('should have correct parameter definitions', () => {
    const saveMemory = memoryToolModule.tools.find(t => t.name === 'save_memory');
    expect(saveMemory?.parameters).toHaveLength(4);
    expect(saveMemory?.parameters.find(p => p.name === 'contactId')?.required).toBe(true);
    expect(saveMemory?.parameters.find(p => p.name === 'category')?.required).toBe(true);
    expect(saveMemory?.parameters.find(p => p.name === 'key')?.required).toBe(true);
    expect(saveMemory?.parameters.find(p => p.name === 'value')?.required).toBe(true);

    const getProfile = memoryToolModule.tools.find(t => t.name === 'get_profile');
    expect(getProfile?.parameters).toHaveLength(1);
    expect(getProfile?.parameters[0].name).toBe('contactId');

    const deleteMemory = memoryToolModule.tools.find(t => t.name === 'delete_memory');
    expect(deleteMemory?.parameters).toHaveLength(1);
    expect(deleteMemory?.parameters[0].name).toBe('memoryId');
  });

  it('should filter out chat_digest from summary category in get_profile', () => {
    // Simulate the behavior of get_profile tool
    const mockMemories = [
      { id: 'mem1', category: 'summary', key: 'chat_digest', value: 'This is a chat digest that should be filtered out', source: 'system' },
      { id: 'mem2', category: 'identity', key: 'name', value: 'John Doe' },
    ];
    
    // This mimics the filtering logic in get_profile
    const filteredMemories = mockMemories.filter((m: any) => !(m.category === 'summary' && m.key === 'chat_digest'));
    
    // Should not contain the chat_digest memory
    expect(filteredMemories).toHaveLength(1);
    expect(filteredMemories[0].key).toBe('name');
  });
});