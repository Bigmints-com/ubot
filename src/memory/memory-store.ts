/**
 * Memory Store
 * SQLite-backed long-term memory for contacts and facts.
 * Stores key-value facts per contact that persist across sessions.
 * Also stores YAML soul documents per persona.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseConnection } from '../data/database/types.js';
import type { Migration } from '../data/database/types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MemoryCategory = 'identity' | 'preference' | 'fact' | 'relationship' | 'note' | 'summary';

export interface MemoryEntry {
  id: string;
  contactId: string;       // WhatsApp JID or LID
  category: MemoryCategory;
  key: string;             // e.g. "name", "language", "birthday"
  value: string;           // the actual fact
  source: string;          // where this was learned ("extracted" | "manual")
  confidence: number;      // 0-1, how confident the extraction was
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Migration                                                          */
/* ------------------------------------------------------------------ */

export const memoryMigrations: Migration[] = [
  {
    id: '003',
    name: 'create_memories',
    up: `
      CREATE TABLE IF NOT EXISTS agent_memories (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'fact',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'extracted',
        confidence REAL NOT NULL DEFAULT 0.8,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_contact ON agent_memories(contact_id);
      CREATE INDEX IF NOT EXISTS idx_memories_category ON agent_memories(contact_id, category);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_unique ON agent_memories(contact_id, category, key);
    `,
    down: `
      DROP TABLE IF EXISTS agent_memories;
    `,
  },
  {
    id: '004',
    name: 'create_soul_documents',
    up: `
      CREATE TABLE IF NOT EXISTS soul_documents (
        persona_id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS soul_documents;
    `,
  },
];

/* ------------------------------------------------------------------ */
/*  Soul Document Types                                                */
/* ------------------------------------------------------------------ */

export interface SoulDocument {
  personaId: string;
  content: string;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Store interface & implementation                                   */
/* ------------------------------------------------------------------ */

interface MemoryRow {
  id: string;
  contact_id: string;
  category: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}

function rowToMemory(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    contactId: row.contact_id,
    category: row.category as MemoryCategory,
    key: row.key,
    value: row.value,
    source: row.source,
    confidence: row.confidence,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface MemoryStore {
  /** Upsert a fact — if same contact+category+key exists, update value */
  saveMemory(contactId: string, category: MemoryCategory, key: string, value: string, source?: string, confidence?: number): MemoryEntry;

  /** Get all memories for a contact, optionally filtered by category */
  getMemories(contactId: string, category?: MemoryCategory): MemoryEntry[];

  /** Get all memories across all contacts */
  getAllMemories(): MemoryEntry[];

  /** Search memories by value text (LIKE query) */
  searchMemories(query: string): MemoryEntry[];

  /** Delete a specific memory */
  deleteMemory(id: string): boolean;

  /** Delete all memories for a contact */
  clearContactMemories(contactId: string): void;

  /** Format a contact's memories as a readable string for injection into prompts */
  formatForPrompt(contactId: string): string;

  /* ---- Soul Documents ---- */

  /** Get a soul document for a persona */
  getDocument(personaId: string): SoulDocument | null;

  /** Save or update a soul document */
  saveDocument(personaId: string, content: string): SoulDocument;

  /** Delete a soul document */
  deleteDocument(personaId: string): boolean;

  /** List all soul documents */
  listDocuments(): SoulDocument[];
}

export function createMemoryStore(db: DatabaseConnection): MemoryStore {
  return {
    saveMemory(contactId, category, key, value, source = 'extracted', confidence = 0.8): MemoryEntry {
      const now = new Date().toISOString();

      // Try to upsert — if contact+category+key exists, update
      const existing = db.queryOne<MemoryRow>(
        'SELECT * FROM agent_memories WHERE contact_id = ? AND category = ? AND key = ?',
        [contactId, category, key]
      );

      if (existing) {
        db.execute(
          'UPDATE agent_memories SET value = ?, source = ?, confidence = ?, updated_at = ? WHERE id = ?',
          [value, source, confidence, now, existing.id]
        );
        console.log(`[Memory] Updated: ${contactId} → ${category}/${key} = "${value}"`);
        return {
          ...rowToMemory(existing),
          value,
          source,
          confidence,
          updatedAt: new Date(now),
        };
      }

      const id = uuidv4();
      db.execute(
        `INSERT INTO agent_memories (id, contact_id, category, key, value, source, confidence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, contactId, category, key, value, source, confidence, now, now]
      );

      console.log(`[Memory] Saved: ${contactId} → ${category}/${key} = "${value}"`);
      return {
        id,
        contactId,
        category,
        key,
        value,
        source,
        confidence,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    },

    getMemories(contactId, category?): MemoryEntry[] {
      if (category) {
        const rows = db.query<MemoryRow>(
          'SELECT * FROM agent_memories WHERE contact_id = ? AND category = ? ORDER BY updated_at DESC',
          [contactId, category]
        );
        return rows.map(rowToMemory);
      }
      const rows = db.query<MemoryRow>(
        'SELECT * FROM agent_memories WHERE contact_id = ? ORDER BY category, updated_at DESC',
        [contactId]
      );
      return rows.map(rowToMemory);
    },

    getAllMemories(): MemoryEntry[] {
      const rows = db.query<MemoryRow>(
        'SELECT * FROM agent_memories ORDER BY updated_at DESC'
      );
      return rows.map(rowToMemory);
    },

    searchMemories(query): MemoryEntry[] {
      const rows = db.query<MemoryRow>(
        'SELECT * FROM agent_memories WHERE value LIKE ? OR key LIKE ? ORDER BY updated_at DESC',
        [`%${query}%`, `%${query}%`]
      );
      return rows.map(rowToMemory);
    },

    deleteMemory(id): boolean {
      const result = db.execute('DELETE FROM agent_memories WHERE id = ?', [id]);
      return result.changes > 0;
    },

    clearContactMemories(contactId): void {
      db.execute('DELETE FROM agent_memories WHERE contact_id = ?', [contactId]);
    },

    formatForPrompt(contactId): string {
      const memories = this.getMemories(contactId);
      if (memories.length === 0) return '';

      const grouped = new Map<string, MemoryEntry[]>();
      for (const m of memories) {
        const list = grouped.get(m.category) || [];
        list.push(m);
        grouped.set(m.category, list);
      }

      let result = '## What you know about this contact:\n';
      for (const [category, items] of grouped) {
        result += `\n### ${category.charAt(0).toUpperCase() + category.slice(1)}:\n`;
        for (const item of items) {
          result += `- ${item.key}: ${item.value}\n`;
        }
      }
      return result;
    },

    /* ---- Soul Documents ---- */

    getDocument(personaId): SoulDocument | null {
      const row = db.queryOne<{ persona_id: string; content: string; updated_at: string }>(
        'SELECT * FROM soul_documents WHERE persona_id = ?',
        [personaId]
      );
      if (!row) return null;
      return { personaId: row.persona_id, content: row.content, updatedAt: new Date(row.updated_at) };
    },

    saveDocument(personaId, content): SoulDocument {
      const now = new Date().toISOString();
      const existing = db.queryOne<{ persona_id: string }>(
        'SELECT persona_id FROM soul_documents WHERE persona_id = ?',
        [personaId]
      );
      if (existing) {
        db.execute(
          'UPDATE soul_documents SET content = ?, updated_at = ? WHERE persona_id = ?',
          [content, now, personaId]
        );
      } else {
        db.execute(
          'INSERT INTO soul_documents (persona_id, content, updated_at) VALUES (?, ?, ?)',
          [personaId, content, now]
        );
      }
      console.log(`[Soul] Document saved for ${personaId} (${content.length} chars)`);
      return { personaId, content, updatedAt: new Date(now) };
    },

    deleteDocument(personaId): boolean {
      const result = db.execute('DELETE FROM soul_documents WHERE persona_id = ?', [personaId]);
      return result.changes > 0;
    },

    listDocuments(): SoulDocument[] {
      const rows = db.query<{ persona_id: string; content: string; updated_at: string }>(
        'SELECT * FROM soul_documents ORDER BY updated_at DESC'
      );
      return rows.map(r => ({ personaId: r.persona_id, content: r.content, updatedAt: new Date(r.updated_at) }));
    },
  };
}
