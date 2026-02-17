import express from 'express';
import { emailService } from '../services/emailService.js';

const router = express.Router();

router.post('/send', async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    const result = await emailService.sendEmail(to, subject, body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

export default router;