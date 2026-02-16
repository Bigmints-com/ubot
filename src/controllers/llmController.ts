import { Router } from 'express';
import { LLMService } from '../services/llmService.js';
import { LLMRequest } from '../types/llm.js';

const router = Router();
const llmService = new LLMService();

router.post('/generate', async (req, res) => {
  try {
    const request: LLMRequest = req.body;
    const response = await llmService.generateResponse(request);
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export { router as llmController };