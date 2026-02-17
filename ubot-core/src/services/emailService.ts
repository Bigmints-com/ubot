import { google } from 'googleapis.js';
import { Email, SendEmailRequest, ListEmailsRequest, GetEmailRequest } from '../types/email.js';

export class EmailService {
  private gmail: any;

  constructor(auth: any) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async sendEmail(request: SendEmailRequest): Promise<void> {
    const emailContent = this.formatEmail(request);
    const encodedEmail = Buffer.from(emailContent).toString('base64url').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
      },
    });
  }

  async listEmails(request: ListEmailsRequest): Promise<Email[]> {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults: request.maxResults || 10,
      labelIds: request.labelIds,
    });

    if (!response.data.messages) {
      return [];
    }

    const messages = response.data.messages;
    const emailPromises = messages.map(async (msg: any) => {
      const email = await this.gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
      });
      return this.parseEmail(email.data);
    });

    return Promise.all(emailPromises);
  }

  async getEmail(request: GetEmailRequest): Promise<Email> {
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id: request.id,
    });
    return this.parseEmail(response.data);
  }

  private formatEmail(request: SendEmailRequest): string {
    const headers = [
      `From: ${request.from || 'me'}`,
      `To: ${request.to}`,
      `Subject: ${request.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
    ].join('\r\n');

    return `${headers}\r\n\r\n${request.body}`;
  }

  private parseEmail(data: any): Email {
    const headers = data.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

    return {
      id: data.id,
      threadId: data.threadId,
      snippet: data.snippet,
      labelIds: data.labelIds,
      internalDate: data.internalDate,
      payload: data.payload,
    };
  }
}