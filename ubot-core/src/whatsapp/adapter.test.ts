import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  WhatsAppAdapterImpl, 
  createWhatsAppAdapter 
} from './adapter.js';
import { WhatsAppConnection } from './connection.js';
import type { WhatsAppAdapter } from './types.js';

vi.mock('./connection.js', () => {
  const mockSocket = {
    sendMessage: vi.fn(),
    groupMetadata: vi.fn(),
    loadMessages: vi.fn(),
    downloadMediaMessage: vi.fn(),
    store: { contacts: {}, chats: {} },
    ev: { on: vi.fn(), off: vi.fn() }
  };

  return {
    WhatsAppConnection: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(mockSocket),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getSocket: vi.fn().mockReturnValue(mockSocket),
      on: vi.fn(),
      off: vi.fn()
    })),
    createWhatsAppConnection: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(mockSocket),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getSocket: vi.fn().mockReturnValue(mockSocket),
      on: vi.fn(),
      off: vi.fn()
    })
  };
});

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter;

  beforeEach(() => {
    adapter = createWhatsAppAdapter({
      config: {
        sessionName: 'test-session',
        printQRInTerminal: false
      }
    });
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.disconnect().catch(() => {});
    }
  });

  describe('createWhatsAppAdapter', () => {
    it('should create an adapter instance', () => {
      expect(adapter).toBeDefined();
      expect(adapter.status).toBe('disconnected');
    });

    it('should have null socket initially', () => {
      expect(adapter.socket).toBeNull();
    });
  });

  describe('status', () => {
    it('should return disconnected status initially', () => {
      expect(adapter.status).toBe('disconnected');
    });
  });

  describe('event handling', () => {
    it('should register event listeners', () => {
      const listener = vi.fn();
      adapter.on('connection.update', listener);
      
      expect(() => adapter.on('connection.update', listener)).not.toThrow();
    });

    it('should unregister event listeners', () => {
      const listener = vi.fn();
      adapter.on('connection.update', listener);
      adapter.off('connection.update', listener);
      
      expect(() => adapter.off('connection.update', listener)).not.toThrow();
    });
  });

  describe('sendMessage', () => {
    it('should throw error when not connected', async () => {
      await expect(adapter.sendMessage('1234567890', 'Hello'))
        .rejects.toThrow('Not connected to WhatsApp');
    });
  });

  describe('getContacts', () => {
    it('should throw error when not connected', async () => {
      await expect(adapter.getContacts())
        .rejects.toThrow('Not connected to WhatsApp');
    });
  });

  describe('getGroups', () => {
    it('should throw error when not connected', async () => {
      await expect(adapter.getGroups())
        .rejects.toThrow('Not connected to WhatsApp');
    });
  });

  describe('getGroupMetadata', () => {
    it('should throw error when not connected', async () => {
      await expect(adapter.getGroupMetadata('1234567890@g.us'))
        .rejects.toThrow('Not connected to WhatsApp');
    });
  });

  describe('downloadMedia', () => {
    it('should throw error when not connected', async () => {
      await expect(adapter.downloadMedia('message-id'))
        .rejects.toThrow('Not connected to WhatsApp');
    });
  });
});

describe('WhatsAppAdapterImpl', () => {
  it('should be instantiable', () => {
    const adapter = new WhatsAppAdapterImpl({
      config: { sessionName: 'test' }
    });
    expect(adapter).toBeInstanceOf(WhatsAppAdapterImpl);
  });
});