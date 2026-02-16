import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const db = new Database('ubot.db');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
const initSchema = () => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            message TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
};

initSchema();

export const logMessage = (message: string) => {
    const id = uuidv4();
    const stmt = db.prepare('INSERT INTO logs (id, message) VALUES (?, ?)');
    stmt.run(id, message);
    return id;
};

export const getAllLogs = () => {
    const stmt = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC');
    return stmt.all();
};

export default db;