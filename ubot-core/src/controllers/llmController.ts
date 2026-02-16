import { Router } from 'express';
import llmService from '../services/llmService.js';

const router = Router();

router.post('/chat', async (req, res) => {
  try {
    const { prompt, model, history } = req.body;
    const response = await llmService.chat({ prompt, model, history });
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;