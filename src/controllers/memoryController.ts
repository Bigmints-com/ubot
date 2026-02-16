import { Router } from 'express';
import { MemoryService } from '../services/memoryService.js';
import type { MemoryEntry } from '../types/memory.js';

const router = Router();

router.get('/memory/:userId', (req, res) => {
  const { userId } = req.params;
  const memories = MemoryService.getAll(userId);
  res.json(memories);
});

router.get('/memory/:userId/:key', (req, res) => {
  const { userId, key } = req.params;
  const memory = MemoryService.get(userId, key);
  if (memory) {
    res.json(memory);
  } else {
    res.status(404).json({ error: 'Memory entry not found' });
  }
});

router.post('/memory', (req, res) => {
  const { userId, key, value, type } = req.body as MemoryEntry;
  if (!userId || !key || value === undefined) {
    return res.status(400).json({ error: 'userId, key, and value are required' });
  }
  const id = MemoryService.save({ userId, key, value, type });
  res.status(201).json({ id, ...req.body });
});

router.delete('/memory/:userId/:key', (req, res) => {
  const { userId, key } = req.params;
  const deleted = MemoryService.delete(userId, key);
  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Memory entry not found' });
  }
});

export { router as memoryController };