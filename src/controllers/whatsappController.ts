import express from 'express';
import { whatsappService } from '../services/whatsappService.js';

const router = express.Router();

router.post('/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    const result = await whatsappService.sendMessage(to, message);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send WhatsApp message' });
  }
});

export default router;