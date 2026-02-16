import { Router } from 'express';
import { WhatsAppService } from '../services/whatsappService.js';
import { WhatsAppConfig } from '../types/whatsapp.js';

const router = Router();
const whatsappService = new WhatsAppService({ sessionName: 'ubot-session' });

router.post('/connect', async (req, res) => {
  try {
    await whatsappService.connect();
    res.json({ success: true, status: whatsappService.getStatus() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to connect' });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ success: true, status: whatsappService.getStatus() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to disconnect' });
  }
});

router.get('/status', (req, res) => {
  res.json({ status: whatsappService.getStatus() });
});

router.post('/send', async (req, res) => {
  const { to, content } = req.body;
  if (!to || !content) {
    return res.status(400).json({ success: false, error: 'Missing to or content' });
  }

  const success = await whatsappService.sendMessage(to, content);
  res.json({ success, status: whatsappService.getStatus() });
});

export default router;