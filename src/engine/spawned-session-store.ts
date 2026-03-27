/**
 * Spawned Session Store
 *
 * Persistence for sub-agent sessions spawned via sessions_spawn tool.
 */

import { log } from '../logger/ring-buffer.js';
import type { DatabaseConnection, Migration } from '../data/database/types.js';

export interface SpawnedSession {
  id: string;
  task: string;
  agentId: string | null;
  status: 'running' | 'completed' | 'failed';
  result: string | null;
  error: string | null;
  startTime: number;
  endTime: number | null;
  depth: number;
}

/** Migration for spawned session tables */
export const spawnedSessionMigrations: Migration[] = [
  {
    id: '012',
    name: 'create_spawned_sessions',
    up: `
      CREATE TABLE IF NOT EXISTS spawned_sessions (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        agent_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        result TEXT,
        error TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        depth INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_spawned_sessions_status ON spawned_sessions(status);
    `,
    down: `
      DROP TABLE IF EXISTS spawned_sessions;
    `,
  },
];

export interface SpawnedSessionStore {
  create(session: Omit<SpawnedSession, 'endTime' | 'result' | 'error'>): SpawnedSession;
  get(id: string): SpawnedSession | undefined;
  list(): SpawnedSession[];
  update(id: string, updates: Partial<Pick<SpawnedSession, 'status' | 'result' | 'error' | 'endTime'>>): boolean;
  delete(id: string): boolean;
  failAllRunningSessions(error: string): number;
}

export function createSpawnedSessionStore(db: DatabaseConnection): SpawnedSessionStore {
  function rowToSession(row: any): SpawnedSession {
    return {
      id: row.id,
      task: row.task,
      agentId: row.agent_id,
      status: row.status as SpawnedSession['status'],
      result: row.result,
      error: row.error,
      startTime: row.start_time,
      endTime: row.end_time,
      depth: row.depth,
    };
  }

  return {
    create(session: Omit<SpawnedSession, 'endTime' | 'result' | 'error'>): SpawnedSession {
      db.execute(
        'INSERT INTO spawned_sessions (id, task, agent_id, status, start_time, depth) VALUES (?, ?, ?, ?, ?, ?)',
        [session.id, session.task, session.agentId, session.status, session.startTime, session.depth]
      );
      return { ...session, endTime: null, result: null, error: null };
    },

    get(id: string): SpawnedSession | undefined {
      const row = db.queryOne<any>('SELECT * FROM spawned_sessions WHERE id = ?', [id]);
      return row ? rowToSession(row) : undefined;
    },

    list(): SpawnedSession[] {
      const rows = db.query<any>('SELECT * FROM spawned_sessions ORDER BY start_time DESC');
      return rows.map(rowToSession);
    },

    update(id: string, updates: Partial<Pick<SpawnedSession, 'status' | 'result' | 'error' | 'endTime'>>): boolean {
      const fields: string[] = [];
      const params: any[] = [];

      if (updates.status) {
        fields.push('status = ?');
        params.push(updates.status);
      }
      if (updates.result !== undefined) {
        fields.push('result = ?');
        params.push(updates.result);
      }
      if (updates.error !== undefined) {
        fields.push('error = ?');
        params.push(updates.error);
      }
      if (updates.endTime !== undefined) {
        fields.push('end_time = ?');
        params.push(updates.endTime);
      }

      if (fields.length === 0) return true;

      params.push(id);
      db.execute(`UPDATE spawned_sessions SET ${fields.join(', ')} WHERE id = ?`, params);
      return true;
    },

    delete(id: string): boolean {
      db.execute('DELETE FROM spawned_sessions WHERE id = ?', [id]);
      return true;
    },

    failAllRunningSessions(error: string): number {
      const result = db.execute(
        'UPDATE spawned_sessions SET status = ?, error = ?, end_time = ? WHERE status = ?',
        ['failed', error, Date.now(), 'running']
      );
      if (result.changes > 0) {
        log.info('SpawnedSessionStore', `Marked ${result.changes} abandoned sub-agents as failed`);
      }
      return result.changes;
    },
  };
}
