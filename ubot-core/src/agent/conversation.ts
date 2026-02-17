/**
 * Conversation Store
 * SQLite-backed conversation history management
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseConnection } from '../database/types.js';
import type { Migration } from '../database/types.js';
import type { ChatMessage, ChatRole, ChatMessageMetadata, ConversationSession } from './types.js';

/** Migration for conversation tables */
export const conversationMigrations: Migration[] = [
  {
    id: '002',
    name: 'create_conversations',
    up: `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'web',
        name TEXT NOT NULL DEFAULT 'Chat',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_type ON chat_sessions(type);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON chat_sessions(updated_at);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON chat_messages(timestamp);
    `,
    down: `
      DROP TABLE IF EXISTS chat_messages;
      DROP TABLE IF EXISTS chat_sessions;
    `,
  },
];

export interface ConversationStore {
  createSession(id: string, type: 'web' | 'whatsapp', name?: string): ConversationSession;
  getSession(id: string): ConversationSession | undefined;
  getOrCreateSession(id: string, type: 'web' | 'whatsapp', name?: string): ConversationSession;
  listSessions(): ConversationSession[];
  addMessage(sessionId: string, role: ChatRole, content: string, metadata?: ChatMessageMetadata): ChatMessage;
  getHistory(sessionId: string, limit?: number): ChatMessage[];
  clearSession(sessionId: string): void;
  clearAll(): void;
  deleteSession(sessionId: string): void;
}

export function createConversationStore(db: DatabaseConnection): ConversationStore {
  return {
    createSession(id: string, type: 'web' | 'whatsapp', name?: string): ConversationSession {
      const now = new Date().toISOString();
      db.execute(
        'INSERT INTO chat_sessions (id, type, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, type, name || (type === 'web' ? 'Command Center' : id), now, now]
      );
      return {
        id,
        type,
        name: name || (type === 'web' ? 'Command Center' : id),
        createdAt: new Date(now),
        updatedAt: new Date(now),
        messageCount: 0,
      };
    },

    getSession(id: string): ConversationSession | undefined {
      const row = db.queryOne<any>(
        `SELECT s.*, COUNT(m.id) as message_count 
         FROM chat_sessions s 
         LEFT JOIN chat_messages m ON m.session_id = s.id 
         WHERE s.id = ? 
         GROUP BY s.id`,
        [id]
      );
      if (!row) return undefined;
      return {
        id: row.id,
        type: row.type,
        name: row.name,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        messageCount: row.message_count,
      };
    },

    getOrCreateSession(id: string, type: 'web' | 'whatsapp', name?: string): ConversationSession {
      const existing = this.getSession(id);
      if (existing) return existing;
      return this.createSession(id, type, name);
    },

    listSessions(): ConversationSession[] {
      const rows = db.query<any>(
        `SELECT s.*, COUNT(m.id) as message_count 
         FROM chat_sessions s 
         LEFT JOIN chat_messages m ON m.session_id = s.id 
         GROUP BY s.id 
         ORDER BY s.updated_at DESC`
      );
      return rows.map((row: any) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        messageCount: row.message_count,
      }));
    },

    addMessage(sessionId: string, role: ChatRole, content: string, metadata?: ChatMessageMetadata): ChatMessage {
      const id = uuidv4();
      const now = new Date();
      const timestamp = now.toISOString();

      db.execute(
        'INSERT INTO chat_messages (id, session_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)',
        [id, sessionId, role, content, timestamp, metadata ? JSON.stringify(metadata) : null]
      );

      // Update session timestamp
      db.execute(
        'UPDATE chat_sessions SET updated_at = ? WHERE id = ?',
        [timestamp, sessionId]
      );

      return {
        id,
        sessionId,
        role,
        content,
        timestamp: now,
        metadata,
      };
    },

    getHistory(sessionId: string, limit = 50): ChatMessage[] {
      const rows = db.query<any>(
        `SELECT * FROM chat_messages 
         WHERE session_id = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [sessionId, limit]
      );
      return rows.reverse().map((row: any) => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role as ChatRole,
        content: row.content,
        timestamp: new Date(row.timestamp),
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }));
    },

    clearSession(sessionId: string): void {
      db.execute('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
    },

    clearAll(): void {
      db.execute('DELETE FROM chat_messages');
      db.execute('DELETE FROM chat_sessions');
    },

    deleteSession(sessionId: string): void {
      db.execute('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
      db.execute('DELETE FROM chat_sessions WHERE id = ?', [sessionId]);
    },
  };
}
