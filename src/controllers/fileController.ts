import { fileService } from '../services/fileService.js';
import { Request, Response } from 'express';

export const fileController = {
  async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      const owner = req.body.owner || 'unknown';
      const filename = req.body.filename || 'unknown';
      const mimetype = req.body.mimetype || 'application/octet-stream';
      const buffer = req.body;

      if (!buffer || !Buffer.isBuffer(buffer)) {
        res.status(400).json({ error: 'No file data provided' });
        return;
      }

      const file = await fileService.uploadFile({
        owner,
        filename,
        mimetype,
        buffer,
      });

      res.status(201).json(file);
    } catch (error) {
      res.status(500).json({ error: 'Failed to upload file' });
    }
  },

  async listFiles(req: Request, res: Response): Promise<void> {
    try {
      const owner = req.query.owner as string;
      const files = await fileService.getFilesByOwner(owner);
      res.json(files);
    } catch (error) {
      res.status(500).json({ error: 'Failed to list files' });
    }
  },

  async deleteFile(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      await fileService.deleteFile(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete file' });
    }
  },
};