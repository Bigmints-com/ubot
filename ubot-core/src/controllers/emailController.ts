import { Request, Response } from 'express';
import { sendEmail } from '../services/emailService.js';
import { Email } from '../types/email.js';

export const emailController = {
  sendEmail: async (req: Request, res: Response): Promise<void> => {
    try {
      const { auth, emailData } = req.body;

      if (!auth || !emailData) {
        res.status(400).json({ error: 'Missing auth or email data' });
        return;
      }

      const result = await sendEmail(auth, emailData as Email);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Email sending error:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  },
};