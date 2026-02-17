import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { mkdir, access, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { 
  WhatsAppConnectionConfig, 
  WhatsAppConnectionStatus,
  WhatsAppAdapterEvents,
  WhatsAppMessage
} from './types.js';
import { DEFAULT_WHATSAPP_CONFIG } from './types.js';

export interface ConnectionResult {
  socket: WASocket;
  saveCreds: () => Promise<void>;
}

export interface ConnectionState {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  lastConnected: Date | null;
  reconnectAttempts: number;
}

export class WhatsAppConnection {
  private config: WhatsAppConnectionConfig;
  private socket: WASocket | null = null;
  private state: ConnectionState;
  private eventListeners: Map<string, Set<Function>> = new Map();
  private saveCreds: (() => Promise<void>) | null = null;
  private lidToPhone: Map<string, string> = new Map();
  private logger: pino.Logger;

  constructor(config: Partial<WhatsAppConnectionConfig> = {}) {
    this.config = { ...DEFAULT_WHATSAPP_CONFIG, ...config };
    this.state = {
      status: 'disconnected',
      qrCode: null,
      lastConnected: null,
      reconnectAttempts: 0
    };
    this.logger = pino({
      level: 'silent'
    });
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

  async connect(): Promise<WASocket> {
    this.updateStatus('connecting');
    
    try {
      await this.ensureSessionDirectory();
      
      const { state, saveCreds } = await useMultiFileAuthState(
        join(this.config.sessionPath, this.config.sessionName)
      );
      this.saveCreds = saveCreds;
      
      const { version } = await fetchLatestBaileysVersion();
      
      this.socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: this.config.printQRInTerminal,
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
        if (this.config.printQRInTerminal) {
          qrcode.generate(qr, { small: true });
        }
        this.emit('connection.update', 'connecting', qr);
      }
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          this.updateStatus('reconnecting');
          this.state.reconnectAttempts++;
          await this.connect();
        } else {
          this.updateStatus('logged_out');
        }
      } else if (connection === 'open') {
        this.updateStatus('connected');
        this.state.lastConnected = new Date();
        this.state.reconnectAttempts = 0;
        this.state.qrCode = null;
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
        const body = this.extractBody(msg);
        console.log(`[WhatsApp] 📩 type=${type} fromMe=${msg.key.fromMe} jid=${msg.key.remoteJid} body="${body.slice(0, 60)}"`);
        if (!msg.key.fromMe && body) {
          this.emit('message.received', this.parseMessage(msg, body));
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
    let from = msg.key.remoteJid || '';

    // Resolve LID → phone number if needed
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

    console.log(`[WhatsApp] ✅ Parsed: from=${from} body="${body.slice(0, 60)}"`);
    return {
      id: msg.key.id,
      from,
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