import { db } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { File, FileUploadRequest } from '../types/file.js';

const FILES_DIR = path.join(process.cwd(), 'uploads');

export const fileService = {
  async initialize(): Promise<void> {
    if (!fs.existsSync(FILES_DIR)) {
      fs.mkdirSync(FILES_DIR, { recursive: true });
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        size INTEGER NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        owner TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `);
  },

  async uploadFile(request: FileUploadRequest): Promise<File> {
    const id = uuidv4();
    const filePath = path.join(FILES_DIR, id);
    
    fs.writeFileSync(filePath, request.buffer);
    
    const fileRecord: File = {
      id,
      name: request.filename,
      size: request.buffer.length,
      type: request.mimetype,
      path: filePath,
      owner: request.owner,
      createdAt: new Date(),
    };

    const stmt = db.prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?)');
    stmt.run(
      fileRecord.id,
      fileRecord.name,
      fileRecord.size,
      fileRecord.type,
      fileRecord.path,
      fileRecord.owner,
      fileRecord.createdAt.toISOString()
    );

    return fileRecord;
  },

  async getFilesByOwner(owner: string): Promise<File[]> {
    const stmt = db.prepare('SELECT * FROM files WHERE owner = ?');
    const rows = stmt.all(owner) as any[];
    return rows.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt)
    }));
  },

  async deleteFile(id: string): Promise<void> {
    const stmt = db.prepare('SELECT path FROM files WHERE id = ?');
    const row = stmt.get(id) as { path: string } | undefined;
    
    if (row) {
      fs.unlinkSync(row.path);
    }
    
    const deleteStmt = db.prepare('DELETE FROM files WHERE id = ?');
    deleteStmt.run(id);
  },
};