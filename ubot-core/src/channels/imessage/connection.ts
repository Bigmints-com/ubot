/**
 * BlueBubbles Connection
 *
 * Manages the HTTP connection to the BlueBubbles server.
 * Handles API calls, webhooks for incoming messages, and connection health.
 */

import type { BlueBubblesConfig, BBMessage, BBChat, BBHandle } from './types.js';
import { EventEmitter } from 'events';

export type BBConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface BBConnectionEvents {
  'connection.update': (status: BBConnectionStatus) => void;
  'message.received': (msg: BBMessage) => void;
  'error': (err: Error) => void;
}

export class BlueBubblesConnection extends EventEmitter {
  private config: BlueBubblesConfig;
  private _status: BBConnectionStatus = 'disconnected';
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: BlueBubblesConfig) {
    super();
    this.config = config;
  }

  get status(): BBConnectionStatus {
    return this._status;
  }

  get serverUrl(): string {
    return this.config.serverUrl.replace(/\/$/, '');
  }

  /** Test connection by pinging the server */
  async connect(): Promise<void> {
    if (!this.config.serverUrl || !this.config.password) {
      throw new Error('BlueBubbles serverUrl and password are required. Configure in Settings → iMessage.');
    }

    this._status = 'connecting';
    this.emit('connection.update', this._status);

    try {
      // Ping the server to verify connectivity
      const info = await this.apiGet('/api/v1/ping');
      console.log(`[iMessage] Connected to BlueBubbles (message: ${info?.message || 'ok'})`);

      this._status = 'connected';
      this.emit('connection.update', this._status);

      // Start health check polling
      this.startHealthCheck();
    } catch (err: any) {
      this._status = 'error';
      this.emit('connection.update', this._status);
      this.emit('error', new Error(`Failed to connect to BlueBubbles: ${err.message}`));
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this._status = 'disconnected';
    this.emit('connection.update', this._status);
    console.log('[iMessage] Disconnected from BlueBubbles');
  }

  /** Process incoming webhook from BlueBubbles */
  handleWebhook(event: string, data: any): void {
    if (event === 'new-message' && data) {
      const msg = data as BBMessage;
      // Skip messages from self unless explicitly needed
      if (!msg.isFromMe) {
        this.emit('message.received', msg);
      }
    }
  }

  // ── API Methods ─────────────────────────────────────────

  /** Send a text message */
  async sendMessage(chatGuid: string, text: string): Promise<BBMessage> {
    const result = await this.apiPost('/api/v1/message/text', {
      chatGuid,
      message: text,
      method: 'private-api', // Falls back to AppleScript if private API unavailable
    });
    return result?.data;
  }

  /** Send a message to a new chat by address (phone/email) */
  async sendNewMessage(address: string, text: string): Promise<BBMessage> {
    const result = await this.apiPost('/api/v1/message/text', {
      chatGuid: `iMessage;-;${address}`,
      message: text,
      method: 'private-api',
    });
    return result?.data;
  }

  /** Get recent chats */
  async getChats(limit = 25, offset = 0): Promise<BBChat[]> {
    const result = await this.apiPost('/api/v1/chat/query', {
      limit,
      offset,
      sort: 'lastmessage',
      with: ['lastMessage', 'sms'],
    });
    return result?.data || [];
  }

  /** Get messages from a chat */
  async getChatMessages(chatGuid: string, limit = 25, offset = 0): Promise<BBMessage[]> {
    const result = await this.apiGet(`/api/v1/chat/${encodeURIComponent(chatGuid)}/message`, {
      limit: limit.toString(),
      offset: offset.toString(),
      sort: 'DESC',
      with: 'handle,chat',
    });
    return result?.data || [];
  }

  /** Search messages */
  async searchMessages(query: string, limit = 25): Promise<BBMessage[]> {
    const result = await this.apiPost('/api/v1/message/query', {
      where: [{
        statement: 'message.text LIKE :query',
        args: { query: `%${query}%` },
      }],
      limit,
      sort: 'DESC',
      with: ['handle', 'chat'],
    });
    return result?.data || [];
  }

  /** Get handles (contacts) */
  async getHandles(): Promise<BBHandle[]> {
    const result = await this.apiGet('/api/v1/handle', { limit: '200' });
    return result?.data || [];
  }

  /** Get a specific chat by GUID */
  async getChat(chatGuid: string): Promise<BBChat | null> {
    try {
      const result = await this.apiGet(`/api/v1/chat/${encodeURIComponent(chatGuid)}`);
      return result?.data || null;
    } catch {
      return null;
    }
  }

  // ── HTTP Helpers ────────────────────────────────────────

  private async apiGet(path: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(`${this.serverUrl}${path}`);
    url.searchParams.set('password', this.config.password);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`BlueBubbles API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  private async apiPost(path: string, body: Record<string, any>): Promise<any> {
    const url = new URL(`${this.serverUrl}${path}`);
    url.searchParams.set('password', this.config.password);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`BlueBubbles API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  private startHealthCheck(): void {
    // Check connection every 60s
    this.healthTimer = setInterval(async () => {
      try {
        await this.apiGet('/api/v1/ping');
        if (this._status !== 'connected') {
          this._status = 'connected';
          this.emit('connection.update', this._status);
        }
      } catch {
        if (this._status === 'connected') {
          this._status = 'error';
          this.emit('connection.update', this._status);
          console.warn('[iMessage] BlueBubbles health check failed');
        }
      }
    }, 60000);
  }
}
