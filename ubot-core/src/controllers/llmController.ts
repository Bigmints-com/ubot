import express from 'express';
import { llmService } from '../services/llmService.js';

const router = express.Router();

router.post('/chat', async (req, res) => {
  try {
    const { messages, model } = req.body;
    const response = await llmService.chat(messages, model);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Failed to chat with LLM' });
  }
});

export default router;