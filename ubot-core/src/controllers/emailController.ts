import express from 'express.js';
import { EmailService } from '../services/emailService.js';
import { SendEmailRequest, ListEmailsRequest, GetEmailRequest } from '../types/email.js';

const router = express.Router();

router.post('/send', async (req, res) => {
  try {
    const { auth } = req.body;
    const request: SendEmailRequest = req.body;

    if (!auth) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const emailService = new EmailService(auth);
    await emailService.sendEmail(request);

    res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

router.get('/list', async (req, res) => {
  try {
    const { auth } = req.query;
    const request: ListEmailsRequest = {
      maxResults: parseInt(req.query.maxResults as string) || 10,
      labelIds: req.query.labelIds as string[],
    };

    if (!auth) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const emailService = new EmailService(auth);
    const emails = await emailService.listEmails(request);

    res.status(200).json(emails);
  } catch (error) {
    console.error('Error listing emails:', error);
    res.status(500).json({ error: 'Failed to list emails' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { auth } = req.query;
    const request: GetEmailRequest = { id: req.params.id };

    if (!auth) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    const emailService = new EmailService(auth);
    const email = await emailService.getEmail(request);

    res.status(200).json(email);
  } catch (error) {
    console.error('Error getting email:', error);
    res.status(500).json({ error: 'Failed to get email' });
  }
});

export default router;