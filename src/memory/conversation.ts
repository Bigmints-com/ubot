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
  const getClient = () => db.get_client();

  return {
    async createSession(id: string, type: 'web' | 'whatsapp' | 'telegram' | 'webchat' | 'sub-agent' | 'scheduler', name?: string): Promise<ConversationSession> {
      const now = new Date().toISOString();
      const sessionName = name || (type === 'web' ? 'Command Center' : id);
      let ownerId: string | null = null;
      
      try {
        const { data: authUsers } = await getClient().auth.admin.listUsers();
        if (authUsers?.users?.length) {
          ownerId = authUsers.users[0].id;
        } else {
          const { data: profiles } = await getClient().from('users').select('id').limit(1);
          if (profiles?.length) ownerId = profiles[0].id;
        }
      } catch (e) {
        console.error('[Supabase] owner_id resolution failed:', e);
      }

      const { error } = await getClient()
        .from('ubot_chat_sessions')
        .upsert({
          id,
          type,
          name: sessionName,
          owner_id: ownerId || '00000000-0000-0000-0000-000000000000',
          created_at: now,
          updated_at: now
        }, { onConflict: 'id', ignoreDuplicates: true });

      if (error) {
        console.error('[Supabase] createSession Error:', error);
        throw new Error(`Failed to create session: ${error.message}`);
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
      const { data, error } = await getClient()
        .from('ubot_chat_sessions')
        .select(`
          id, type, name, created_at, updated_at,
          ubot_chat_messages (id)
        `)
        .eq('id', id)
        .single();
        
      if (error || !data) return undefined;
      return {
        id: data.id,
        type: data.type as any,
        name: data.name,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        messageCount: data.ubot_chat_messages?.length || 0,
      };
    },

    async getOrCreateSession(id: string, type: 'web' | 'whatsapp' | 'telegram' | 'webchat' | 'sub-agent' | 'scheduler', name?: string): Promise<ConversationSession> {
      const existing = await this.getSession(id);
      if (existing) return existing;
      return this.createSession(id, type, name);
    },

    async listSessions(): Promise<ConversationSession[]> {
      const { data, error } = await getClient()
        .from('ubot_chat_sessions')
        .select(`
          id, type, name, created_at, updated_at,
          ubot_chat_messages (id)
        `)
        .order('updated_at', { ascending: false });
        
      if (error) {
        console.error('[Supabase] listSessions Error:', error);
        return [];
      }

      if (!data) return [];
      
      return data.map((row: any) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        messageCount: row.ubot_chat_messages?.length || 0,
      }));
    },

    async addMessage(sessionId: string, role: ChatRole, content: string, metadata?: ChatMessageMetadata): Promise<ChatMessage> {
      const id = uuidv4();
      const now = new Date();
      const timestamp = now.toISOString();

      const { error } = await getClient()
        .from('ubot_chat_messages')
        .insert({
          id,
          session_id: sessionId,
          role,
          content,
          timestamp,
          metadata: metadata ? metadata : null
        });

      if (error) console.error('[Supabase] addMessage Error:', error);

      // Update session timestamp
      await getClient()
        .from('ubot_chat_sessions')
        .update({ updated_at: timestamp })
        .eq('id', sessionId);

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
      const { data, error } = await getClient()
        .from('ubot_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: false })
        .limit(limit);
        
      if (error || !data) return [];
      
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
      await getClient()
        .from('ubot_chat_messages')
        .delete()
        .eq('session_id', sessionId);
    },

    async clearAll(): Promise<void> {
      await getClient().from('ubot_chat_messages').delete().neq('id', '0');
      await getClient().from('ubot_chat_sessions').delete().neq('id', '0');
    },

    async deleteSession(sessionId: string): Promise<void> {
      await getClient()
        .from('ubot_chat_messages')
        .delete()
        .eq('session_id', sessionId);
      await getClient()
        .from('ubot_chat_sessions')
        .delete()
        .eq('id', sessionId);
    },

    async renameSession(sessionId: string, name: string): Promise<void> {
      await getClient()
        .from('ubot_chat_sessions')
        .update({ name: name, updated_at: new Date().toISOString() })
        .eq('id', sessionId);
    },
  };
}
