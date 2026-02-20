/**
 * Gmail API Service
 * 
 * Provides tools for listing, reading, sending, searching, trashing,
 * and replying to emails via the official Gmail API.
 */

import { google } from 'googleapis';

function getGmail(auth: any) {
  return google.gmail({ version: 'v1', auth });
}

/** Decode base64url-encoded email body */
function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

/** Extract text body from message parts */
function extractTextFromParts(parts: any[]): string {
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBody(part.body.data);
    }
    if (part.parts) {
      const text = extractTextFromParts(part.parts);
      if (text) return text;
    }
  }
  // Fallback to HTML if no plain text
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      const html = decodeBody(part.body.data);
      // Strip HTML tags for a rough text version
      return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
    if (part.parts) {
      const text = extractTextFromParts(part.parts);
      if (text) return text;
    }
  }
  return '';
}

/** Get header value from message headers */
function getHeader(headers: any[], name: string): string {
  const header = headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

/**
 * List recent emails.
 */
export async function gmailList(
  auth: any,
  options?: { query?: string; maxResults?: number },
): Promise<string> {
  const gmail = getGmail(auth);
  const maxResults = options?.maxResults ?? 15;
  const q = options?.query || '';

  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: q || undefined,
  });

  const messages = res.data.messages || [];
  if (messages.length === 0) {
    return q ? `No emails found matching "${q}".` : 'Inbox is empty.';
  }

  // Fetch metadata for each message
  const emailSummaries: string[] = [];
  for (const msg of messages.slice(0, maxResults)) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });

    const headers = detail.data.payload?.headers || [];
    const from = getHeader(headers, 'From');
    const subject = getHeader(headers, 'Subject');
    const date = getHeader(headers, 'Date');
    const unread = detail.data.labelIds?.includes('UNREAD');
    const flag = unread ? '📬' : '📭';
    const snippet = detail.data.snippet || '';

    emailSummaries.push(
      `${flag} **${from}** — ${subject || '(no subject)'}${snippet ? ` (${snippet.slice(0, 80)})` : ''} — ${date}\n   ID: \`${msg.id}\``
    );
  }

  return `Found ${messages.length} email(s)${q ? ` matching "${q}"` : ''}:\n\n${emailSummaries.join('\n\n')}`;
}

/**
 * Read a specific email by ID.
 */
export async function gmailRead(
  auth: any,
  messageId: string,
): Promise<string> {
  const gmail = getGmail(auth);

  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = res.data.payload?.headers || [];
  const from = getHeader(headers, 'From');
  const to = getHeader(headers, 'To');
  const subject = getHeader(headers, 'Subject');
  const date = getHeader(headers, 'Date');
  const threadId = res.data.threadId;

  let body = '';
  if (res.data.payload?.parts) {
    body = extractTextFromParts(res.data.payload.parts);
  } else if (res.data.payload?.body?.data) {
    body = decodeBody(res.data.payload.body.data);
  }

  // Truncate very long emails
  if (body.length > 3000) {
    body = body.slice(0, 3000) + '\n\n... (truncated)';
  }

  return [
    `**From:** ${from}`,
    `**To:** ${to}`,
    `**Subject:** ${subject}`,
    `**Date:** ${date}`,
    `**Thread ID:** ${threadId}`,
    `**Message ID:** ${messageId}`,
    '',
    body || '(empty body)',
  ].join('\n');
}

/**
 * Send an email.
 */
export async function gmailSend(
  auth: any,
  options: { to: string; subject: string; body: string; cc?: string; bcc?: string },
): Promise<string> {
  const gmail = getGmail(auth);

  const headers = [
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];
  if (options.cc) headers.push(`Cc: ${options.cc}`);
  if (options.bcc) headers.push(`Bcc: ${options.bcc}`);

  const message = `${headers.join('\r\n')}\r\n\r\n${options.body}`;
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  return `Email sent to ${options.to}. Message ID: ${res.data.id}`;
}

/**
 * Search emails with Gmail query syntax.
 */
export async function gmailSearch(
  auth: any,
  query: string,
  maxResults?: number,
): Promise<string> {
  return gmailList(auth, { query, maxResults: maxResults ?? 15 });
}

/**
 * Trash an email.
 */
export async function gmailTrash(
  auth: any,
  messageId: string,
): Promise<string> {
  const gmail = getGmail(auth);
  await gmail.users.messages.trash({ userId: 'me', id: messageId });
  return `Email ${messageId} moved to trash.`;
}

/**
 * Reply to an email thread.
 */
export async function gmailReply(
  auth: any,
  options: { messageId: string; body: string },
): Promise<string> {
  const gmail = getGmail(auth);

  // Get the original message to extract headers
  const original = await gmail.users.messages.get({
    userId: 'me',
    id: options.messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Message-ID'],
  });

  const headers = original.data.payload?.headers || [];
  const replyTo = getHeader(headers, 'From');
  const subject = getHeader(headers, 'Subject');
  const messageIdHeader = getHeader(headers, 'Message-ID');
  const threadId = original.data.threadId;

  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const replyHeaders = [
    `To: ${replyTo}`,
    `Subject: ${replySubject}`,
    `In-Reply-To: ${messageIdHeader}`,
    `References: ${messageIdHeader}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];

  const message = `${replyHeaders.join('\r\n')}\r\n\r\n${options.body}`;
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage, threadId: threadId || undefined },
  });

  return `Reply sent to ${replyTo}. Message ID: ${res.data.id}`;
}
