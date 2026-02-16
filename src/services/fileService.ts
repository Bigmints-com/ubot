import Database from 'better-sqlite3';
import { FileRecord } from '../types/file.js';

const db = new Database('./ubot.db');

// Initialize files table
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    uploadedAt TEXT NOT NULL
  )
`);

export const saveFile = (file: Omit<FileRecord, 'id' | 'uploadedAt'>): FileRecord => {
  const id = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(id, file.filename, file.mimetype, file.size, file.path, uploadedAt);
  return { id, ...file, uploadedAt };
};

export const getAllFiles = (): FileRecord[] => {
  const stmt = db.prepare('SELECT * FROM files');
  return stmt.all() as FileRecord[];
};

export const deleteFile = (id: string): boolean => {
  const stmt = db.prepare('DELETE FROM files WHERE id = ?');
  const info = stmt.run(id);
  return info.changes > 0;
};