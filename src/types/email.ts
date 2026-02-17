export interface Email {
  to: string;
  subject: string;
  body: string;
  attachments?: Attachment[];
}

export interface Attachment {
  filename: string;
  content: Buffer | string;
  mimeType: string;
}