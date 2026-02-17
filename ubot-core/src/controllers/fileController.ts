import express from 'express';
import { fileService } from '../services/fileService.js';

const router = express.Router();

router.post('/upload', async (req, res) => {
  try {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const result = await fileService.uploadFile(file);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

export default router;