import type { WASocket } from '@whiskeysockets/baileys';

export type WhatsAppConnectionStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'logged_out';

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: Date;
  isFromMe: boolean;
  hasMedia: boolean;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  quotedMessageId?: string;
  /** In group messages, the actual sender JID (e.g. 919947793728@s.whatsapp.net) */
  participant?: string;
}

export interface WhatsAppSendMessageOptions {
  quotedMessageId?: string;
  mentions?: string[];
  delay?: number;
}

export interface WhatsAppContact {
  id: string;
  name?: string;
  pushName?: string;
  isGroup: boolean;
  isBlocked: boolean;
}

export interface WhatsAppGroupMetadata {
  id: string;
  subject: string;
  owner: string;
  participants: Array<{
    id: string;
    isAdmin: boolean;
    isSuperAdmin: boolean;
  }>;
  createdAt: Date;
}

export interface WhatsAppConnectionConfig {
  sessionName: string;
  sessionPath: string;
  printQRInTerminal: boolean;
  connectTimeoutMs: number;
  keepAliveIntervalMs: number;
  retryRequestDelayMs: number;
  maxMsgRetryCount: number;
  browser?: [string, string, string];
}

export interface WhatsAppAdapterEvents {
  'connection.update': (status: WhatsAppConnectionStatus, qrCode?: string) => void;
  'message.received': (message: WhatsAppMessage) => void;
  'message.sent': (message: WhatsAppMessage) => void;
  'message.ack': (messageId: string, ack: number) => void;
  'group.update': (metadata: WhatsAppGroupMetadata) => void;
  'contact.update': (contact: WhatsAppContact) => void;
  'error': (error: Error) => void;
}

export interface WhatsAppAdapterOptions {
  config: Partial<WhatsAppConnectionConfig>;
  onMessage?: (message: WhatsAppMessage) => Promise<void> | void;
  onConnectionChange?: (status: WhatsAppConnectionStatus, qrCode?: string) => void;
  onError?: (error: Error) => void;
}

export interface WhatsAppAdapter {
  readonly status: WhatsAppConnectionStatus;
  readonly socket: WASocket | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(to: string, body: string, options?: WhatsAppSendMessageOptions): Promise<WhatsAppMessage>;
  getContacts(): Promise<WhatsAppContact[]>;
  getGroups(): Promise<WhatsAppGroupMetadata[]>;
  getGroupMetadata(groupId: string): Promise<WhatsAppGroupMetadata>;
  downloadMedia(messageId: string): Promise<Buffer | null>;
  on<K extends keyof WhatsAppAdapterEvents>(event: K, listener: WhatsAppAdapterEvents[K]): void;
  off<K extends keyof WhatsAppAdapterEvents>(event: K, listener: WhatsAppAdapterEvents[K]): void;
}

export interface WhatsAppSessionData {
  sessionId: string;
  createdAt: Date;
  lastActive: Date;
  status: WhatsAppConnectionStatus;
}

export interface WhatsAppMessageFilter {
  from?: string;
  to?: string;
  isFromMe?: boolean;
  hasMedia?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface WhatsAppMessageListResult {
  messages: WhatsAppMessage[];
  total: number;
  hasMore: boolean;
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConnectionConfig = {
  sessionName: 'ubot-session',
  sessionPath: './sessions',
  printQRInTerminal: true,
  connectTimeoutMs: 60000,
  keepAliveIntervalMs: 25000,
  retryRequestDelayMs: 1000,
  maxMsgRetryCount: 5,
  browser: ['Ubot Core', 'Chrome', '1.0.0']
};