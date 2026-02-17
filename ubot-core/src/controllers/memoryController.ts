import express from 'express';
import { memoryService } from '../services/memoryService.js';

const router = express.Router();

router.post('/add', async (req, res) => {
  try {
    const { key, value, metadata } = req.body;
    const result = await memoryService.addMemory(key, value, metadata);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add memory' });
  }
});

router.post('/search', async (req, res) => {
  try {
    const { query, limit } = req.body;
    const results = await memoryService.searchMemory(query, limit);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search memory' });
  }
});

export default router;