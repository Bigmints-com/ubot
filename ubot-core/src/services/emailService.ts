import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

export const sendEmail = async (to: string, subject: string, body: string) => {
  try {
    // Get access token
    const tokenResponse = await client.getAccessToken();
    
    if (!tokenResponse.access_token) {
      throw new Error('Failed to retrieve access token');
    }

    const accessToken = tokenResponse.access_token;

    const gmail = google.gmail({ version: 'v1', auth: accessToken });

    const emailContent = [
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
      `Content-Transfer-Encoding: 7bit`,
      `To: ${to}`,
      `Subject: ${subject}`,
      ``,
      `${body}`,
    ].join('\n');

    const encodedEmail = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
      },
    });

    return { success: true, messageId: response.data.id };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};