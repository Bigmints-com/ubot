export interface EmailRequest {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}