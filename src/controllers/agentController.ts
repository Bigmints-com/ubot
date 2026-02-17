import express from 'express';
import { agentService } from '../services/agentService.js';

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const { name, instructions, model } = req.body;
    const agent = await agentService.createAgent(name, instructions, model);
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const { agentId, message, history } = req.body;
    const response = await agentService.chatWithAgent(agentId, message, history);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Failed to chat with agent' });
  }
});

export default router;