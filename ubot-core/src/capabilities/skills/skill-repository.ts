/**
 * Skill Repository
 * SQLite persistence for skills using the universal Trigger → Processor → Outcome model.
 */

import type { DatabaseConnection } from '../../data/database/types.js';
import type { Skill, SkillTrigger, SkillProcessor, SkillOutcome } from './skill-types.js';

function generateId(): string {
  return `sk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create/migrate the skills table */
export function ensureSkillsTable(db: DatabaseConnection): void {
  const tableInfo = db.query<{ name: string }>(`PRAGMA table_info(user_skills)`);
  const hasPrompt = tableInfo.some(col => col.name === 'prompt');

  if (hasPrompt || tableInfo.length === 0) {
    // Old schema or no table — drop and create fresh
    if (hasPrompt) {
      console.log('[Skills] Old schema detected — dropping and recreating...');
      db.execute('DROP TABLE user_skills');
    }
    db.execute(`
      CREATE TABLE user_skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        trigger_json TEXT NOT NULL DEFAULT '{}',
        processor_json TEXT NOT NULL DEFAULT '{}',
        outcome_json TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }
  // else: new schema already exists, nothing to do
}

interface SkillRow {
  id: string;
  name: string;
  description: string;
  trigger_json: string;
  processor_json: string;
  outcome_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trigger: JSON.parse(row.trigger_json || '{"events":["manual:run"]}'),
    processor: JSON.parse(row.processor_json || '{"instructions":""}'),
    outcome: JSON.parse(row.outcome_json || '{"action":"reply"}'),
    enabled: row.enabled === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface SkillRepository {
  create(skill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>): Skill;
  getById(id: string): Skill | null;
  getAll(): Skill[];
  getEnabled(): Skill[];
  getByEventType(eventKey: string): Skill[];
  update(id: string, updates: Partial<Skill>): Skill | null;
  delete(id: string): boolean;
  toggleEnabled(id: string, enabled: boolean): Skill | null;
}

/** @deprecated Use SkillRepository */
export type UserSkillRepository = SkillRepository;

export function createSkillRepository(db: DatabaseConnection): SkillRepository {
  ensureSkillsTable(db);

  return {
    create(data) {
      const id = generateId();
      const now = new Date().toISOString();
      db.execute(
        `INSERT INTO user_skills (id, name, description, trigger_json, processor_json, outcome_json, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.name,
          data.description,
          JSON.stringify(data.trigger),
          JSON.stringify(data.processor),
          JSON.stringify(data.outcome),
          data.enabled ? 1 : 0,
          now,
          now,
        ]
      );
      return this.getById(id)!;
    },

    getById(id) {
      const row = db.queryOne<SkillRow>('SELECT * FROM user_skills WHERE id = ?', [id]);
      return row ? rowToSkill(row) : null;
    },

    getAll() {
      const rows = db.query<SkillRow>('SELECT * FROM user_skills ORDER BY created_at DESC');
      return rows.map(rowToSkill);
    },

    getEnabled() {
      const rows = db.query<SkillRow>('SELECT * FROM user_skills WHERE enabled = 1 ORDER BY name');
      return rows.map(rowToSkill);
    },

    getByEventType(eventKey: string) {
      // eventKey is 'source:type', e.g. 'whatsapp:message'
      // We need to find skills whose trigger.events contains this key or '*:*'
      const all = this.getEnabled();
      return all.filter(skill => {
        return skill.trigger.events.some(e => 
          e === eventKey || e === '*:*' || e === `${eventKey.split(':')[0]}:*`
        );
      });
    },

    update(id, updates) {
      const existing = this.getById(id);
      if (!existing) return null;

      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
      if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
      if (updates.trigger !== undefined) { fields.push('trigger_json = ?'); values.push(JSON.stringify(updates.trigger)); }
      if (updates.processor !== undefined) { fields.push('processor_json = ?'); values.push(JSON.stringify(updates.processor)); }
      if (updates.outcome !== undefined) { fields.push('outcome_json = ?'); values.push(JSON.stringify(updates.outcome)); }
      if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }

      if (fields.length === 0) return existing;

      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      db.execute(`UPDATE user_skills SET ${fields.join(', ')} WHERE id = ?`, values);
      return this.getById(id);
    },

    delete(id) {
      const result = db.execute('DELETE FROM user_skills WHERE id = ?', [id]);
      return result.changes > 0;
    },

    toggleEnabled(id, enabled) {
      return this.update(id, { enabled });
    },
  };
}

/** @deprecated Use createSkillRepository */
export const createUserSkillRepository = createSkillRepository;
