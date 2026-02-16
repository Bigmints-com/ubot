export interface WAConnectionStatus {
  status: 'connecting' | 'open' | 'close' | 'qr';
  qr?: string;
}

export interface WAMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

export interface WhatsAppConfig {
  sessionName: string;
}