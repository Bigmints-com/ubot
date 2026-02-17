import express from 'express';
import { safetyService } from '../services/safetyService.js';

const router = express.Router();

router.post('/scan', async (req, res) => {
  try {
    const { content } = req.body;
    const result = await safetyService.scanContent(content);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to scan content' });
  }
});

export default router;