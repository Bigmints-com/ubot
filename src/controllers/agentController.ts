import { Router } from 'express';
import { agentService } from '../services/agentService.js';
import { Agent, CreateAgentDto } from '../types/agent.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const agents = agentService.getAll();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve agents' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body as CreateAgentDto;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const newAgent = agentService.create({ name });
    res.status(201).json(newAgent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = agentService.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

export const agentRouter = router;