import { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } from '@whiskeysockets/baileys/index.js';
import { logger } from './logger.js';
import { WhatsAppSession, WhatsAppMessage } from '../types/whatsapp.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

class WhatsAppService {
  private socket: any = null;
  private sessionPath: string;
  private isConnected: boolean = false;
  private qrCode: string | null = null;

  constructor() {
    this.sessionPath = join(process.cwd(), 'sessions');
    if (!existsSync(this.sessionPath)) {
      mkdirSync(this.sessionPath, { recursive: true });
    }
  }

  async connect(): Promise<void> {
    if (this.socket) {
      logger.info('WhatsApp is already connected.');
      return;
    }

    logger.info('Initializing WhatsApp connection...');
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Ubot Core', 'Chrome', '1.0.0'],
    });

    // Save credentials whenever they are updated
    this.socket.ev.on('creds.update', saveCreds);

    // Connection update events
    this.socket.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        logger.info('QR Code generated. Please scan it.');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        logger.warn('WhatsApp connection closed', { shouldReconnect });
        this.isConnected = false;
        this.socket = null;

        if (shouldReconnect) {
          await delay(1000);
          await this.connect();
        }
      } else if (connection === 'open') {
        this.isConnected = true;
        this.qrCode = null;
        logger.info('WhatsApp connected successfully');
      }
    });

    // Handle incoming messages
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type === 'notify') {
        for (const msg of messages) {
          if (!msg.message) continue;

          const messageData: WhatsAppMessage = {
            id: msg.key.id,
            from: msg.key.remoteJid,
            to: msg.key.fromMe ? msg.key.remoteJid : msg.key.remoteJid.split('@')[0] + '@s.whatsapp.net',
            content: JSON.stringify(msg.message),
            timestamp: Date.now(),
          };

          logger.info('New WhatsApp message received', { message: messageData });
          // Here you could trigger an LLM agent to process the message
          // await this.processMessage(messageData);
        }
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      await this.socket.end(undefined);
      this.socket = null;
      this.isConnected = false;
      logger.info('WhatsApp disconnected');
    }
  }

  async sendMessage(to: string, content: string): Promise<boolean> {
    if (!this.socket || !this.isConnected) {
      logger.error('Cannot send message: Not connected');
      return false;
    }

    try {
      const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
      await this.socket.sendMessage(jid, { text: content });
      logger.info('Message sent successfully', { to, content });
      return true;
    } catch (error) {
      logger.error('Failed to send message', { error });
      return false;
    }
  }

  getQRCode(): string | null {
    return this.qrCode;
  }

  getStatus(): WhatsAppSession {
    return {
      id: 'default',
      status: this.isConnected ? 'CONNECTED' : 'DISCONNECTED',
    };
  }
}

// Initialize logger for Baileys if needed, or reuse app logger
const pino = (options: any) => ({
  info: (msg: string, meta?: any) => logger.info(msg, meta),
  warn: (msg: string, meta?: any) => logger.warn(msg, meta),
  error: (msg: string, meta?: any) => logger.error(msg, meta),
});

export const whatsappService = new WhatsAppService();