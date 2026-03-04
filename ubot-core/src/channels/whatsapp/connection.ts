import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  type WASocket
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { mkdir, access, readdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import type { 
  WhatsAppConnectionConfig, 
  WhatsAppConnectionStatus,
  WhatsAppAdapterEvents,
  WhatsAppMessage
} from './types.js';
import { DEFAULT_WHATSAPP_CONFIG } from './types.js';
import type { AnyMessageContent, WAMessage } from '@whiskeysockets/baileys';
import { WhatsAppRateLimiter, createRateLimiter } from './rate-limiter.js';
import type { RateLimiterConfig } from './rate-limiter.js';

export interface ConnectionResult {
  socket: WASocket;
  saveCreds: () => Promise<void>;
}

export interface ConnectionState {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  lastConnected: Date | null;
  reconnectAttempts: number;
  /** How many full QR cycles (connect→timeout→close) without a successful scan */
  qrAttempts: number;
}

export class WhatsAppConnection {
  private config: WhatsAppConnectionConfig;
  private socket: WASocket | null = null;
  private state: ConnectionState;
  private eventListeners: Map<string, Set<Function>> = new Map();
  private saveCreds: (() => Promise<void>) | null = null;
  private lidToPhone: Map<string, string> = new Map();
  private logger: pino.Logger;
  private rateLimiter: WhatsAppRateLimiter;
  /** Keep recent raw messages for media download */
  private rawMessages: Map<string, any> = new Map();
  private readonly MAX_RAW_MESSAGES = 200;

  /** Maximum QR code cycles before giving up (0 = unlimited). Default 3. */
  private maxQrRetries: number;
  /** Maximum reconnection attempts for non-QR disconnects. Default 10. */
  private maxReconnectAttempts: number;
  /** Whether we have ever connected in this session */
  private hasConnectedBefore = false;
  /** Whether the user manually disconnected (to prevent auto-reconnect) */
  private isManualDisconnect = false;

  constructor(config: Partial<WhatsAppConnectionConfig> = {}) {
    this.config = { ...DEFAULT_WHATSAPP_CONFIG, ...config };
    this.maxQrRetries = config.maxQrRetries ?? 3;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
    this.state = {
      status: 'disconnected',
      qrCode: null,
      lastConnected: null,
      reconnectAttempts: 0,
      qrAttempts: 0,
    };
    this.logger = pino({
      level: 'silent'
    });
    this.rateLimiter = createRateLimiter(config.rateLimiter);
  }

  get status(): WhatsAppConnectionStatus {
    return this.state.status;
  }

  get isConnected(): boolean {
    return this.state.status === 'connected' && this.socket !== null;
  }

  getSocket(): WASocket | null {
    return this.socket;
  }

  /** Get the connected user's info (phone number + name), or null if not connected */
  getUser(): { id: string; name: string | undefined; phone: string } | null {
    if (!this.socket?.user) return null;
    const user = this.socket.user;
    // Baileys user.id is in format "919947793728:34@s.whatsapp.net"
    const phone = user.id.split(':')[0].split('@')[0];
    return {
      id: user.id,
      name: user.name,
      phone: `+${phone}`,
    };
  }

  /** Send a message through the rate limiter (preferred over raw socket.sendMessage) */
  async sendMessage(jid: string, content: AnyMessageContent): Promise<WAMessage | undefined> {
    if (!this.socket) throw new Error('Not connected to WhatsApp');
    return this.rateLimiter.sendMessage(this.socket, jid, content);
  }

  /** Download media from a received message */
  async downloadMedia(messageId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const rawMsg = this.rawMessages.get(messageId);
    if (!rawMsg) return null;

    const msg = rawMsg.message;
    if (!msg) return null;

    // Determine MIME type from message content
    let mimeType = 'application/octet-stream';
    if (msg.imageMessage) mimeType = msg.imageMessage.mimetype || 'image/jpeg';
    else if (msg.videoMessage) mimeType = msg.videoMessage.mimetype || 'video/mp4';
    else if (msg.audioMessage) mimeType = msg.audioMessage.mimetype || 'audio/ogg';
    else if (msg.documentMessage) mimeType = msg.documentMessage.mimetype || 'application/octet-stream';
    else return null;

    try {
      const buffer = await downloadMediaMessage(rawMsg, 'buffer', {});
      return { buffer: buffer as Buffer, mimeType };
    } catch (err: any) {
      console.error(`[WhatsApp] Failed to download media for ${messageId}:`, err.message);
      return null;
    }
  }

  /** Get the rate limiter instance (for stats / config updates) */
  getRateLimiter(): WhatsAppRateLimiter {
    return this.rateLimiter;
  }

  async connect(): Promise<WASocket> {
    this.isManualDisconnect = false;
    this.updateStatus('connecting');
    
    try {
      await this.ensureSessionDirectory();
      
      const { state, saveCreds } = await useMultiFileAuthState(
        join(this.config.sessionPath, this.config.sessionName)
      );
      this.saveCreds = saveCreds;
      
      // Fetch WA Web version
      let version: [number, number, number];
      try {
        const fetched = await fetchLatestBaileysVersion();
        if (fetched.version && Array.isArray(fetched.version) && fetched.version.length === 3) {
          version = fetched.version as [number, number, number];
        } else {
          console.warn('[WhatsApp] ⚠️ Invalid version format from API — using fallback');
          version = [2, 3000, 1015901307];
        }
      } catch {
        console.warn('[WhatsApp] ⚠️ Failed to fetch version — using fallback');
        version = [2, 3000, 1015901307];
      }
      console.log('[WhatsApp] Using WA Web version:', version);
      
      this.socket = makeWASocket({
        version,
        auth: state,
        connectTimeoutMs: this.config.connectTimeoutMs,
        keepAliveIntervalMs: this.config.keepAliveIntervalMs,
        retryRequestDelayMs: this.config.retryRequestDelayMs,
        maxMsgRetryCount: this.config.maxMsgRetryCount,
        browser: this.config.browser,
        logger: this.logger,
        getMessage: async () => {
          return { conversation: '' };
        }
      });

      this.setupEventHandlers();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.connectTimeoutMs);

        const onConnected = () => {
          clearTimeout(timeout);
          this.off('connection.update', onConnected);
          resolve(this.socket!);
        };

        const onDisconnected = (status: WhatsAppConnectionStatus) => {
          if (status === 'logged_out' || status === 'disconnected') {
            clearTimeout(timeout);
            this.off('connection.update', onDisconnected);
            reject(new Error('Connection failed'));
          }
        };

        this.on('connection.update', onConnected);
        this.on('connection.update', onDisconnected);
      });
    } catch (error) {
      this.updateStatus('disconnected');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.isManualDisconnect = true;
      await this.socket.end(undefined);
      this.socket = null;
      this.updateStatus('disconnected');
    }
  }

  private async ensureSessionDirectory(): Promise<void> {
    const sessionDir = join(this.config.sessionPath, this.config.sessionName);
    try {
      await access(sessionDir);
    } catch {
      await mkdir(sessionDir, { recursive: true });
    }
  }

  /** Delete stale session/auth files so Baileys generates a fresh QR on next connect */
  async clearSession(): Promise<void> {
    const sessionDir = join(this.config.sessionPath, this.config.sessionName);
    try {
      await rm(sessionDir, { recursive: true, force: true });
      console.log('[WhatsApp] 🗑️  Cleared stale session directory:', sessionDir);
    } catch (err: any) {
      console.error('[WhatsApp] Failed to clear session:', err.message);
    }
  }

  /** Load LID→phone mappings from session directory files */
  private async loadLIDMappings(): Promise<void> {
    const sessionDir = join(this.config.sessionPath, this.config.sessionName);
    try {
      const files = await readdir(sessionDir);
      const reverseFiles = files.filter(f => f.startsWith('lid-mapping-') && f.endsWith('_reverse.json'));
      
      for (const file of reverseFiles) {
        try {
          const content = await readFile(join(sessionDir, file), 'utf-8');
          const phoneNumber = JSON.parse(content);
          // Extract LID from filename: lid-mapping-{lid}_reverse.json
          const lid = file.replace('lid-mapping-', '').replace('_reverse.json', '');
          const lidJid = `${lid}@lid`;
          const phoneJid = `${phoneNumber}@s.whatsapp.net`;
          this.lidToPhone.set(lidJid, phoneJid);
        } catch {
          // Skip invalid files
        }
      }
      console.log(`[WhatsApp] Loaded ${this.lidToPhone.size} LID→phone mappings`);
    } catch (err: any) {
      console.error('[WhatsApp] Failed to read session dir for LID mappings:', err.message);
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        this.state.qrCode = qr;
        this.state.qrAttempts++;

        // Check if we've exceeded max QR retries (only if we never connected before)
        if (this.maxQrRetries > 0 && !this.hasConnectedBefore && this.state.qrAttempts > this.maxQrRetries * 6) {
          // Each QR cycle generates ~6 QR codes before the connection times out
          console.log(`[WhatsApp] ⏹️  Giving up after ${this.state.qrAttempts} QR codes — scan the QR from the dashboard and restart, or run 'ubot restart'.`);
          this.updateStatus('disconnected');
          this.socket?.end(undefined);
          return;
        }

        console.log(`[WhatsApp] 📱 QR code generated — scan with your phone (attempt ${this.state.qrAttempts})`);
        this.emit('connection.update', 'connecting', qr);
      }
      
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (this.isManualDisconnect) {
          console.log('[WhatsApp] ⏹️  Manual disconnect — stopping auto-reconnect.');
          this.updateStatus('disconnected');
          return;
        }
        
        if (isLoggedOut) {
          // Session is invalid — clear stale creds and reconnect for fresh QR
          console.log('[WhatsApp] 🔄 Session expired — clearing creds and reconnecting for new QR...');
          this.updateStatus('connecting');
          this.state.reconnectAttempts = 0;
          await this.clearSession();
          await this.connect();
        } else if (!this.hasConnectedBefore && this.maxQrRetries > 0 && this.state.qrAttempts >= this.maxQrRetries * 6) {
          // Never connected + QR retries exhausted → stop
          console.log('[WhatsApp] ⏹️  Not reconnecting — QR retry limit reached. Restart when ready to scan.');
          this.updateStatus('disconnected');
        } else if (this.state.reconnectAttempts >= this.maxReconnectAttempts) {
          // Too many reconnects
          console.log(`[WhatsApp] ⏹️  Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
          this.updateStatus('disconnected');
        } else {
          this.state.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.state.reconnectAttempts - 1), 30000);
          console.log(`[WhatsApp] 🔄 Reconnecting in ${(delay / 1000).toFixed(0)}s (attempt ${this.state.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          this.updateStatus('reconnecting');
          await new Promise(resolve => setTimeout(resolve, delay));
          await this.connect();
        }
      } else if (connection === 'open') {
        this.hasConnectedBefore = true;
        this.updateStatus('connected');
        this.state.lastConnected = new Date();
        this.state.reconnectAttempts = 0;
        this.state.qrAttempts = 0;
        this.state.qrCode = null;
        console.log('[WhatsApp] ✅ Connected successfully');
        // Load LID→phone mappings from session files
        this.loadLIDMappings().catch(err => 
          console.error('[WhatsApp] Failed to load LID mappings:', err.message)
        );
      }
    });

    this.socket.ev.on('creds.update', async () => {
      if (this.saveCreds) {
        await this.saveCreds();
      }
    });

    this.socket.ev.on('messages.upsert', ({ messages, type }) => {
      for (const msg of messages) {
        // Skip status@broadcast — these are WhatsApp Status/Story updates, not real chats
        if (msg.key.remoteJid === 'status@broadcast') continue;

        const body = this.extractBody(msg);
        const hasMedia = !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage);
        console.log(`[WhatsApp] 📩 type=${type} fromMe=${msg.key.fromMe} jid=${msg.key.remoteJid} hasMedia=${hasMedia} body="${body.slice(0, 60)}"`);
        
        // Store raw message for potential media download
        if (msg.key.id && hasMedia) {
          this.rawMessages.set(msg.key.id, msg);
          // Prune old messages to prevent memory leak
          if (this.rawMessages.size > this.MAX_RAW_MESSAGES) {
            const oldest = this.rawMessages.keys().next().value;
            if (oldest) this.rawMessages.delete(oldest);
          }
        }

        // Emit message if it has body text OR media (media-only messages get a placeholder body)
        if (!msg.key.fromMe && (body || hasMedia)) {
          const parsed = this.parseMessage(msg, body || (hasMedia ? '[Media message]' : ''));
          this.emit('message.received', parsed);
        }
      }
    });
  }

  /** Extract text body from any WhatsApp message type */
  private extractBody(msg: any): string {
    const m = msg.message;
    if (!m) return '';
    return m.conversation
      || m.extendedTextMessage?.text
      || m.imageMessage?.caption
      || m.videoMessage?.caption
      || m.documentMessage?.caption
      || m.buttonsResponseMessage?.selectedDisplayText
      || m.listResponseMessage?.singleSelectReply?.selectedRowId
      || m.templateButtonReplyMessage?.selectedDisplayText
      || '';
  }

  private parseMessage(msg: any, body: string): WhatsAppMessage {
    const rawJid = msg.key.remoteJid || '';
    let from = rawJid;

    // Resolve LID → phone number if needed (for identification only)
    if (from.endsWith('@lid')) {
      if (msg.key.participant) {
        from = msg.key.participant;
      } else {
        const resolved = this.lidToPhone.get(from);
        if (resolved) {
          console.log(`[WhatsApp] LID resolved: ${from} → ${resolved}`);
          from = resolved;
        } else {
          console.log(`[WhatsApp] LID unresolved: ${from} (pushName=${msg.pushName || '?'})`);
        }
      }
    }

    console.log(`[WhatsApp] ✅ Parsed: from=${from} rawJid=${rawJid} participant=${msg.key.participant || 'none'} body="${body.slice(0, 60)}"`);
    return {
      id: msg.key.id,
      from,
      rawJid,
      to: msg.key.fromMe ? msg.key.remoteJid : '',
      body,
      timestamp: new Date(msg.messageTimestamp * 1000),
      isFromMe: msg.key.fromMe,
      hasMedia: !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage),
      quotedMessageId: msg.message?.extendedTextMessage?.contextInfo?.stanzaId,
      participant: msg.key.participant || undefined,
    };
  }

  private updateStatus(status: WhatsAppConnectionStatus): void {
    this.state.status = status;
    this.emit('connection.update', status);
  }

  on<K extends keyof WhatsAppAdapterEvents>(
    event: K, 
    listener: WhatsAppAdapterEvents[K]
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off<K extends keyof WhatsAppAdapterEvents>(
    event: K, 
    listener: WhatsAppAdapterEvents[K]
  ): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  private emit<K extends keyof WhatsAppAdapterEvents>(
    event: K, 
    ...args: Parameters<WhatsAppAdapterEvents[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        (listener as Function)(...args);
      }
    }
  }
}

export function createWhatsAppConnection(
  config: Partial<WhatsAppConnectionConfig> = {}
): WhatsAppConnection {
  return new WhatsAppConnection(config);
}