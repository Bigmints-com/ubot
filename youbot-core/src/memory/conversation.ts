/**
 * Conversation Store
 * SQLite-backed conversation history management
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseConnection } from '../data/database/types.js';
import type { ChatMessage, ChatRole, ChatMessageMetadata, ConversationSession } from '../engine/types.js';

export interface ConversationStore {
  createSession(id: string, type: 'web' | 'whatsapp' | 'telegram' | 'webchat' | 'sub-agent' | 'scheduler', name?: string): Promise<ConversationSession>;
  getSession(id: string): Promise<ConversationSession | undefined>;
  getOrCreateSession(id: string, type: 'web' | 'whatsapp' | 'telegram' | 'webchat' | 'sub-agent' | 'scheduler', name?: string): Promise<ConversationSession>;
  listSessions(): Promise<ConversationSession[]>;
  addMessage(sessionId: string, role: ChatRole, content: string, metadata?: ChatMessageMetadata): Promise<ChatMessage>;
  getHistory(sessionId: string, limit?: number): Promise<ChatMessage[]>;
  clearSession(sessionId: string): Promise<void>;
  clearAll(): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  renameSession(sessionId: string, name: string): Promise<void>;
}

export function createConversationStore(db: DatabaseConnection): ConversationStore {
  return {
    async createSession(id: string, type: 'web' | 'whatsapp' | 'telegram' | 'webchat' | 'sub-agent' | 'scheduler', name?: string): Promise<ConversationSession> {
      const now = new Date().toISOString();
      const sessionName = name || (type === 'web' ? 'Command Center' : id);
      const ownerId = '00000000-0000-0000-0000-000000000000'; // Default owner for SQLite backend

      try {
        await db.execute(
          `INSERT INTO youbot_chat_sessions (id, type, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET type = excluded.type, name = excluded.name, updated_at = excluded.updated_at`,
          [id, type, sessionName, ownerId, now, now]
        );
      } catch (error: any) {
        console.error('[SQLite] createSession Error:', error);
        throw new Error(`Failed to create session: ${error.message || error}`);
      }

      return {
        id,
        type,
        name: sessionName,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        messageCount: 0,
      };
    },

    async getSession(id: string): Promise<ConversationSession | undefined> {
      const data = await db.get(`SELECT id, type, name, created_at, updated_at FROM youbot_chat_sessions WHERE id = ?`, [id]);
      if (!data) return undefined;

      const row = await db.get<{count: number}>(`SELECT COUNT(*) as count FROM youbot_chat_messages WHERE session_id = ?`, [id]);
      const count = row?.count || 0;

      return {
        id: data.id,
        type: data.type as any,
        name: data.name,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        messageCount: count,
      };
    },

    async getOrCreateSession(id: string, type: 'web' | 'whatsapp' | 'telegram' | 'webchat' | 'sub-agent' | 'scheduler', name?: string): Promise<ConversationSession> {
      const existing = await this.getSession(id);
      if (existing) return existing;
      return this.createSession(id, type, name);
    },

    async listSessions(): Promise<ConversationSession[]> {
      try {
        const sessions = await db.query(`SELECT id, type, name, created_at, updated_at FROM youbot_chat_sessions ORDER BY updated_at DESC`);
        
        if (!sessions.length) return [];
        
        const messages = await db.query(`SELECT session_id, COUNT(*) as count FROM youbot_chat_messages GROUP BY session_id`);
        const counts = messages.reduce((acc: any, msg: any) => {
          acc[msg.session_id] = msg.count;
          return acc;
        }, {});
        
        return sessions.map((row: any) => ({
          id: row.id,
          type: row.type,
          name: row.name,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          messageCount: counts[row.id] || 0,
        }));
      } catch (error) {
        console.error('[SQLite] listSessions Error:', error);
        return [];
      }
    },

    async addMessage(sessionId: string, role: ChatRole, content: string, metadata?: ChatMessageMetadata): Promise<ChatMessage> {
      const id = uuidv4();
      const now = new Date();
      const timestamp = now.toISOString();

      try {
        await db.execute(
          `INSERT INTO youbot_chat_messages (id, session_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
          [id, sessionId, role, content, timestamp, metadata ? JSON.stringify(metadata) : null]
        );

        await db.execute(
          `UPDATE youbot_chat_sessions SET updated_at = ? WHERE id = ?`,
          [timestamp, sessionId]
        );
      } catch (error) {
        console.error('[SQLite] addMessage Error:', error);
      }

      return {
        id,
        sessionId,
        role,
        content,
        timestamp: now,
        metadata,
      };
    },

    async getHistory(sessionId: string, limit = 50): Promise<ChatMessage[]> {
      const data = await db.query(
        `SELECT * FROM youbot_chat_messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?`,
        [sessionId, limit]
      );
      
      return data.reverse().map((row: any) => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role as ChatRole,
        content: row.content,
        timestamp: new Date(row.timestamp),
        metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      }));
    },

    async clearSession(sessionId: string): Promise<void> {
      await db.execute(`DELETE FROM youbot_chat_messages WHERE session_id = ?`, [sessionId]);
    },

    async clearAll(): Promise<void> {
      await db.execute(`DELETE FROM youbot_chat_messages WHERE id != '0'`);
      await db.execute(`DELETE FROM youbot_chat_sessions WHERE id != '0'`);
    },

    async deleteSession(sessionId: string): Promise<void> {
      await db.execute(`DELETE FROM youbot_chat_messages WHERE session_id = ?`, [sessionId]);
      await db.execute(`DELETE FROM youbot_chat_sessions WHERE id = ?`, [sessionId]);
    },

    async renameSession(sessionId: string, name: string): Promise<void> {
      await db.execute(
        `UPDATE youbot_chat_sessions SET name = ?, updated_at = ? WHERE id = ?`,
        [name, new Date().toISOString(), sessionId]
      );
    },
  };
}
