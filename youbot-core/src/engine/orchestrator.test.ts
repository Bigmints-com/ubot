import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildMessages } from './orchestrator.js';
import { createMockContext } from '../tools/__tests__/test-helpers.js';
import { memoryStore } from '../memory/memory-store.js';
import { soul } from '../memory/soul.js';

describe('Orchestrator Message Building', () => {
  beforeEach(() => {
    // Mock the memory store to avoid actual DB interactions
    vi.spyOn(memoryStore, 'getMemories').mockReturnValue([
      { id: 'mem1', category: 'summary', key: 'chat_digest', value: 'This is a sensitive chat digest that should not appear in prompts', source: 'system' },
      { id: 'mem2', category: 'identity', key: 'name', value: 'John Doe' },
    ]);
    
    vi.spyOn(soul, 'buildSoulPrompt').mockReturnValue(Promise.resolve('Soul data for test'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should exclude chat_digest from messages when building conversation context', async () => {
    const messages = await buildMessages('test-session', 'Hello world', false, []);
    
    // Verify that chat_digest is excluded from the messages
    const userMessages = messages.filter(m => m.role === 'user');
    const systemMessage = messages.find(m => m.role === 'system');
    
    // Should not contain chat_digest content
    expect(userMessages).toHaveLength(2); // system + user message
    expect(systemMessage?.content).toContain('Soul data for test');
    
    // The chat_digest should not be in any user message content
    for (const msg of userMessages) {
      if (typeof msg.content === 'string') {
        expect(msg.content).not.toContain('chat_digest');
      }
    }
  });
});