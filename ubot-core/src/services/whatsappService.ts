import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, WAMessage } from '@whiskeysockets/baileys';
import { WAConnectionStatus, WAMessage, WhatsAppConfig } from '../types/whatsapp.js';

const logger = pino({ level: 'info' });

export class WhatsAppService {
  private socket: any = null;
  private config: WhatsAppConfig;
  private status: WAConnectionStatus = { status: 'close' };

  constructor(config: WhatsAppConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.socket) {
      logger.warn('WhatsApp is already connected');
      return;
    }

    const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_${this.config.sessionName}`);

    this.socket = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['Ubot Core', 'Chrome', '1.0'],
    });

    this.socket.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.status = { status: 'qr', qr };
        logger.info('QR Code received. Scan to connect.');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        this.status = { status: 'close' };
        logger.info('Connection closed. Reconnecting...', { shouldReconnect });
        if (shouldReconnect) this.connect();
      } else if (connection === 'open') {
        this.status = { status: 'open' };
        logger.info('WhatsApp connection opened');
      }
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type === 'notify') {
        for (const msg of messages) {
          if (!msg.message) continue;

          const waMessage: WAMessage = {
            id: msg.key.id,
            from: msg.key.remoteJid,
            to: msg.key.fromMe ? this.socket.user?.id : msg.key.remoteJid,
            content: JSON.stringify(msg.message),
            timestamp: msg.messageTimestamp || Date.now(),
          };

          logger.info('New WhatsApp message received', { message: waMessage });
          // TODO: Integrate with LLM service here
        }
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
      this.status = { status: 'close' };
      logger.info('WhatsApp disconnected');
    }
  }

  async sendMessage(to: string, content: string): Promise<boolean> {
    if (!this.socket || this.status.status !== 'open') {
      logger.error('Cannot send message: Not connected');
      return false;
    }

    try {
      await this.socket.sendMessage(to, { text: content });
      logger.info('Message sent successfully', { to, content });
      return true;
    } catch (error) {
      logger.error('Failed to send message', { error });
      return false;
    }
  }

  getStatus(): WAConnectionStatus {
    return this.status;
  }
}