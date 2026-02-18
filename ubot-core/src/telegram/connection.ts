/**
 * Telegram Connection
 * Manages the Telegram bot connection using node-telegram-bot-api (long-polling).
 */

import TelegramBot from 'node-telegram-bot-api';
import type {
  TelegramConfig,
  TelegramConnectionStatus,
  TelegramConnectionEvents,
  TelegramMessage,
} from './types.js';

export class TelegramConnection {
  private config: TelegramConfig;
  private bot: TelegramBot | null = null;
  private _status: TelegramConnectionStatus = 'disconnected';
  private eventListeners = new Map<string, Set<Function>>();
  private botInfo: TelegramBot.User | null = null;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  get status(): TelegramConnectionStatus {
    return this._status;
  }

  get botUsername(): string | undefined {
    return this.botInfo?.username;
  }

  get botName(): string | undefined {
    return this.botInfo?.first_name;
  }

  getBot(): TelegramBot | null {
    return this.bot;
  }

  async connect(): Promise<void> {
    if (!this.config.botToken) {
      throw new Error('Telegram bot token is required');
    }

    this.updateStatus('connecting');

    try {
      this.bot = new TelegramBot(this.config.botToken, {
        polling: {
          interval: this.config.pollingInterval ?? 1000,
          autoStart: true,
        },
      });

      // Verify the token by fetching bot info
      this.botInfo = await this.bot.getMe();
      console.log(`[Telegram] ✅ Connected as @${this.botInfo.username} (${this.botInfo.first_name})`);
      this.updateStatus('connected');

      // Set up message handler
      this.bot.on('message', (msg) => this.handleMessage(msg));

      // Handle polling errors
      this.bot.on('polling_error', (err) => {
        console.error('[Telegram] Polling error:', err.message);
        this.emit('error', err);
      });

    } catch (err: any) {
      console.error('[Telegram] ❌ Connection failed:', err.message);
      this.updateStatus('error');
      this.bot = null;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
      } catch {
        // Ignore stop errors
      }
      this.bot = null;
      this.botInfo = null;
      this.updateStatus('disconnected');
      console.log('[Telegram] Disconnected');
    }
  }

  async sendMessage(chatId: number | string, text: string, replyToMessageId?: number): Promise<TelegramBot.Message> {
    if (!this.bot) {
      throw new Error('Not connected to Telegram');
    }

    const opts: TelegramBot.SendMessageOptions = {};
    if (replyToMessageId) {
      opts.reply_to_message_id = replyToMessageId;
    }

    return this.bot.sendMessage(chatId, text, opts);
  }

  private handleMessage(msg: TelegramBot.Message): void {
    if (!msg.text && !msg.caption) return;

    const body = msg.text || msg.caption || '';
    const from = msg.from
      ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}`
      : 'Unknown';

    const isFromMe = msg.from?.id === this.botInfo?.id;

    let hasMedia = false;
    let mediaType: TelegramMessage['mediaType'];
    if (msg.photo) { hasMedia = true; mediaType = 'photo'; }
    else if (msg.video) { hasMedia = true; mediaType = 'video'; }
    else if (msg.audio) { hasMedia = true; mediaType = 'audio'; }
    else if (msg.document) { hasMedia = true; mediaType = 'document'; }
    else if (msg.voice) { hasMedia = true; mediaType = 'voice'; }
    else if (msg.sticker) { hasMedia = true; mediaType = 'sticker'; }

    const message: TelegramMessage = {
      id: msg.message_id.toString(),
      chatId: msg.chat.id,
      from,
      fromUsername: msg.from?.username,
      body,
      timestamp: new Date(msg.date * 1000),
      isFromMe,
      hasMedia,
      mediaType,
      replyToMessageId: msg.reply_to_message?.message_id,
    };

    console.log(`[Telegram] 📩 from=${from} chat=${msg.chat.id} body="${body.slice(0, 60)}"`);

    if (!isFromMe) {
      this.emit('message.received', message);
    }
  }

  private updateStatus(status: TelegramConnectionStatus): void {
    this._status = status;
    this.emit('connection.update', status);
  }

  // --- Event Emitter ---
  on<K extends keyof TelegramConnectionEvents>(
    event: K,
    handler: TelegramConnectionEvents[K]
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off<K extends keyof TelegramConnectionEvents>(
    event: K,
    handler: TelegramConnectionEvents[K]
  ): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit<K extends keyof TelegramConnectionEvents>(
    event: K,
    ...args: Parameters<TelegramConnectionEvents[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as Function)(...args);
        } catch (err) {
          console.error(`[Telegram] Event handler error (${event}):`, err);
        }
      }
    }
  }
}
