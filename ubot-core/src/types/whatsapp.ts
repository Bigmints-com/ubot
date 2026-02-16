export interface WhatsAppSession {
  id: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'QR_REQUIRED';
  phoneNumber?: string;
}

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

export interface WhatsAppConfig {
  sessionPath: string;
  autoReconnect: boolean;
}