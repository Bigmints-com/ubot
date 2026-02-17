import { Router } from 'express';
import { performSearch } from '../services/webSearchService.js';

const router = Router();

router.get('/', async (req, res) => {
    const query = req.query.q as string;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    try {
        const results = await performSearch(query);
        res.json({ query, results, count: results.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to perform search' });
    }
});

export default router;