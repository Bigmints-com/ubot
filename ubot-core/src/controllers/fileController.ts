import { Request, Response } from 'express';
import { getAllFiles, deleteFile } from '../services/fileService.js';

export const listFiles = (req: Request, res: Response): void => {
  try {
    const files = getAllFiles();
    res.json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to list files' });
  }
};

export const removeFile = (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const deleted = deleteFile(id);
    if (deleted) {
      res.json({ success: true, message: 'File deleted' });
    } else {
      res.status(404).json({ success: false, message: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete file' });
  }
};