import express from 'express';
import { webSearchService } from '../services/webSearchService.js';

const router = express.Router();

router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    const results = await webSearchService.search(query as string);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search web' });
  }
});

export default router;