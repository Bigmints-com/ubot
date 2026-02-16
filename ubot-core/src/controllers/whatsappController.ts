import { Request, Response } from 'express';
import { whatsappService } from '../services/whatsappService.js';
import { WhatsAppSession } from '../types/whatsapp.js';

export class WhatsAppController {
  public router = express.Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // Get connection status
    this.router.get('/status', (req: Request, res: Response) => {
      const status: WhatsAppSession = whatsappService.getStatus();
      res.json(status);
    });

    // Get QR Code
    this.router.get('/qr', (req: Request, res: Response) => {
      const qr = whatsappService.getQRCode();
      if (qr) {
        res.json({ qr });
      } else {
        res.status(400).json({ error: 'QR Code not available. Connect first.' });
      }
    });

    // Connect to WhatsApp
    this.router.post('/connect', async (req: Request, res: Response) => {
      try {
        await whatsappService.connect();
        res.json({ success: true, message: 'Connecting...' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to connect' });
      }
    });

    // Disconnect from WhatsApp
    this.router.post('/disconnect', async (req: Request, res: Response) => {
      try {
        await whatsappService.disconnect();
        res.json({ success: true, message: 'Disconnected' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to disconnect' });
      }
    });

    // Send message
    this.router.post('/send', async (req: Request, res: Response) => {
      const { to, content } = req.body;

      if (!to || !content) {
        return res.status(400).json({ error: 'Missing to or content' });
      }

      const success = await whatsappService.sendMessage(to, content);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Failed to send message' });
      }
    });
  }
}