import { google } from 'googleapis';

export class EmailSkill {
    private oauth2Client: any;

    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
    }

    async sendEmail(to: string, subject: string, body: string): Promise<void> {
        try {
            // Note: In a production environment, tokens should be stored securely and refreshed automatically.
            // This example assumes tokens are available in the environment or cached.
            const accessToken = process.env.GOOGLE_ACCESS_TOKEN;

            if (!accessToken) {
                throw new Error('Google Access Token not found in environment variables');
            }

            this.oauth2Client.setCredentials({ access_token: accessToken });
            const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

            const emailContent = [
                `To: ${to}`,
                `Subject: ${subject}`,
                'Content-Type: text/html; charset=utf-8',
                '',
                body,
            ].join('\r\n');

            const encodedEmail = Buffer.from(emailContent)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            await gmail.users.messages.send({
                userId: 'me',
                resource: { raw: encodedEmail },
            });

            console.log(`Email sent successfully to ${to}`);
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }
}