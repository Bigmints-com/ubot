import { google } from 'googleapis';
import { Email, Attachment } from '../types/email.js';

export const sendEmail = async (
  auth: any,
  emailData: Email
): Promise<any> => {
  const gmail = google.gmail({ version: 'v1', auth });

  const boundary = '----=_Part_' + Date.now();
  let emailContent = `To: ${emailData.to}\r\n`;
  emailContent += `Subject: ${emailData.subject}\r\n`;
  emailContent += `MIME-Version: 1.0\r\n`;
  emailContent += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

  emailContent += `--${boundary}\r\n`;
  emailContent += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`;
  emailContent += `${emailData.body}\r\n`;

  if (emailData.attachments && emailData.attachments.length > 0) {
    for (const attachment of emailData.attachments) {
      emailContent += `--${boundary}\r\n`;
      emailContent += `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"\r\n`;
      emailContent += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
      emailContent += `Content-Transfer-Encoding: base64\r\n\r\n`;
      emailContent += Buffer.from(attachment.content).toString('base64');
      emailContent += `\r\n`;
    }
    emailContent += `--${boundary}--\r\n`;
  }

  const encodedMessage = Buffer.from(emailContent)
    .toString('base64url')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  return response.data;
};