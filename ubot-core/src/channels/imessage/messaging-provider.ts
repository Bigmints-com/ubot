/**
 * iMessage Messaging Provider (via BlueBubbles)
 * Implements the platform-agnostic MessagingProvider interface.
 */

import type {
  MessagingProvider,
  Message,
  Contact,
  Conversation,
  MessageFilter,
  SendOptions,
  ConnectionStatus,
  MessagingProviderEvents,
} from '../types.js';
import type { BlueBubblesConnection } from './connection.js';
import type { BBMessage } from './types.js';

/** In-memory message store for search/history */
const messageStore: Message[] = [];
const MAX_STORED_MESSAGES = 1000;

function addToStore(msg: Message): void {
  messageStore.push(msg);
  if (messageStore.length > MAX_STORED_MESSAGES) {
    messageStore.splice(0, messageStore.length - MAX_STORED_MESSAGES);
  }
}

/** Convert a BlueBubbles message to our normalized Message format */
function bbToMessage(bbMsg: BBMessage): Message {
  const handle = bbMsg.handle;
  const chat = bbMsg.chats?.[0];
  const from = handle?.address || chat?.chatIdentifier || 'unknown';
  const hasMedia = (bbMsg.attachments?.length ?? 0) > 0;
  let mediaType: Message['mediaType'];
  if (hasMedia && bbMsg.attachments?.[0]?.mimeType) {
    const mime = bbMsg.attachments[0].mimeType;
    if (mime.startsWith('image/')) mediaType = 'image';
    else if (mime.startsWith('video/')) mediaType = 'video';
    else if (mime.startsWith('audio/')) mediaType = 'audio';
    else mediaType = 'document';
  }

  return {
    id: bbMsg.guid,
    channel: 'imessage',
    from: bbMsg.isFromMe ? 'me' : from,
    to: bbMsg.isFromMe ? from : 'me',
    body: bbMsg.text || '',
    timestamp: new Date(bbMsg.dateCreated),
    isFromMe: bbMsg.isFromMe,
    hasMedia,
    mediaType,
    metadata: {
      chatGuid: chat?.guid,
      chatIdentifier: chat?.chatIdentifier,
      handleAddress: handle?.address,
      handleName: [handle?.firstName, handle?.lastName].filter(Boolean).join(' ') || undefined,
    },
  };
}

export class IMessageMessagingProvider implements MessagingProvider {
  readonly channel = 'imessage' as const;
  private _status: ConnectionStatus = 'disconnected';
  private eventListeners = new Map<string, Set<Function>>();
  private connection: BlueBubblesConnection;

  constructor(connection: BlueBubblesConnection) {
    this.connection = connection;
    this.setupForwarding();
  }

  get status(): ConnectionStatus {
    const s = this.connection.status;
    if (s === 'error') return 'disconnected';
    return s as ConnectionStatus;
  }

  /** Forward BlueBubblesConnection events → MessagingProvider events */
  private setupForwarding(): void {
    this.connection.on('connection.update', (status) => {
      this._status = status === 'error' ? 'disconnected' : status as ConnectionStatus;
      this.emit('connection', this._status);
    });

    this.connection.on('message.received', (bbMsg: BBMessage) => {
      const msg = bbToMessage(bbMsg);
      addToStore(msg);
      this.emit('message', msg);
    });

    this.connection.on('error', (err) => {
      this.emit('error', err);
    });
  }

  // --- Connection ---
  async connect(): Promise<void> {
    await this.connection.connect();
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

  // --- Core Operations ---
  async sendMessage(to: string, body: string, _opts?: SendOptions): Promise<Message> {
    // 'to' can be a phone number, email, or chat GUID
    let sent: any;
    if (to.startsWith('iMessage;') || to.startsWith('SMS;')) {
      // It's a chat GUID
      sent = await this.connection.sendMessage(to, body);
    } else {
      // It's a phone/email — send as new message
      sent = await this.connection.sendNewMessage(to, body);
    }

    const msg: Message = {
      id: sent?.guid || `sent-${Date.now()}`,
      channel: 'imessage',
      from: 'me',
      to,
      body,
      timestamp: new Date(),
      isFromMe: true,
      hasMedia: false,
    };

    addToStore(msg);
    return msg;
  }

  async searchMessages(filter: MessageFilter): Promise<Message[]> {
    // If we have a query, use the BlueBubbles search API
    if (filter.query) {
      try {
        const bbMessages = await this.connection.searchMessages(
          filter.query,
          filter.limit || 25
        );
        return bbMessages.map(bbToMessage);
      } catch (err) {
        console.error('[iMessage] Search error, falling back to local store:', err);
      }
    }

    // Fall back to in-memory store for other filters
    let results = [...messageStore];

    if (filter.from) {
      results = results.filter(m => m.from === filter.from);
    }
    if (filter.query) {
      const q = filter.query.toLowerCase();
      results = results.filter(m => m.body.toLowerCase().includes(q));
    }
    if (filter.isFromMe !== undefined) {
      results = results.filter(m => m.isFromMe === filter.isFromMe);
    }
    if (filter.startDate) {
      results = results.filter(m => m.timestamp >= filter.startDate!);
    }
    if (filter.endDate) {
      results = results.filter(m => m.timestamp <= filter.endDate!);
    }

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (filter.offset) results = results.slice(filter.offset);
    if (filter.limit) results = results.slice(0, filter.limit);

    return results;
  }

  async getContacts(query?: string): Promise<Contact[]> {
    try {
      const handles = await this.connection.getHandles();
      let contacts: Contact[] = handles.map(h => ({
        id: h.address,
        channel: 'imessage' as const,
        name: [h.firstName, h.lastName].filter(Boolean).join(' ') || h.address,
        displayName: [h.firstName, h.lastName].filter(Boolean).join(' ') || h.address,
        phone: h.address.startsWith('+') ? h.address : undefined,
        isGroup: false,
        isBlocked: false,
      }));

      if (query) {
        const q = query.toLowerCase();
        contacts = contacts.filter(c =>
          c.name?.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
        );
      }

      return contacts;
    } catch (err) {
      console.error('[iMessage] getContacts error:', err);
      return [];
    }
  }

  async getConversations(limit = 20): Promise<Conversation[]> {
    try {
      const chats = await this.connection.getChats(limit);
      return chats.map(chat => {
        const participants = chat.participants || [];
        const name = chat.displayName ||
          participants.map(p => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.address).join(', ') ||
          chat.chatIdentifier;

        return {
          id: chat.guid,
          channel: 'imessage' as const,
          contact: {
            id: chat.chatIdentifier,
            channel: 'imessage' as const,
            name,
            displayName: name,
            isGroup: participants.length > 1,
            isBlocked: false,
          },
          lastMessage: chat.lastMessage ? bbToMessage(chat.lastMessage) : undefined,
          unreadCount: 0,
          updatedAt: chat.lastMessage ? new Date(chat.lastMessage.dateCreated) : new Date(),
        };
      });
    } catch (err) {
      console.error('[iMessage] getConversations error:', err);
      return [];
    }
  }

  async deleteMessage(_messageId: string): Promise<void> {
    console.log('[iMessage] deleteMessage not supported via BlueBubbles');
  }

  async replyToMessage(messageId: string, body: string): Promise<Message> {
    // Find original message to get chat GUID
    const original = messageStore.find(m => m.id === messageId);
    const chatGuid = original?.metadata?.chatGuid as string;
    if (!chatGuid) {
      throw new Error(`Cannot reply: chat GUID not found for message ${messageId}`);
    }
    return this.sendMessage(chatGuid, body);
  }

  // --- Events ---
  on<K extends keyof MessagingProviderEvents>(
    event: K,
    handler: MessagingProviderEvents[K]
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off<K extends keyof MessagingProviderEvents>(
    event: K,
    handler: MessagingProviderEvents[K]
  ): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit<K extends keyof MessagingProviderEvents>(
    event: K,
    ...args: Parameters<MessagingProviderEvents[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as Function)(...args);
        } catch (err) {
          console.error('[iMessage] Event handler error:', err);
        }
      }
    }
  }

  /** Get the underlying connection */
  getConnection(): BlueBubblesConnection {
    return this.connection;
  }
}
