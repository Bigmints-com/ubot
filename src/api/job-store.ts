/**
 * Async Job Store
 *
 * Persistence for long-running chat jobs.
 * Used by the async API to track progress across restarts.
 */

import { log } from '../logger/ring-buffer.js';
import type { DatabaseConnection, Migration } from '../data/database/types.js';

export interface AsyncJob {
  id: string;
  sessionId: string;
  status: 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

/** Migration for async job tables */
export const asyncJobMigrations: Migration[] = [
  {
    id: '011',
    name: 'create_async_jobs',
    up: `
      CREATE TABLE IF NOT EXISTS async_jobs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing',
        result TEXT,
        error TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_async_jobs_session ON async_jobs(session_id);
      CREATE INDEX IF NOT EXISTS idx_async_jobs_status ON async_jobs(status);
    `,
    down: `
      DROP TABLE IF EXISTS async_jobs;
    `,
  },
];

export interface AsyncJobStore {
  create(jobId: string, sessionId: string): AsyncJob;
  get(jobId: string): AsyncJob | undefined;
  update(jobId: string, updates: Partial<Omit<AsyncJob, 'id' | 'sessionId' | 'startedAt'>>): boolean;
  delete(jobId: string): boolean;
  cleanup(maxAgeMs: number): number;
  failAllProcessingJobs(error: string): number;
}

export function createAsyncJobStore(db: DatabaseConnection): AsyncJobStore {
  function rowToJob(row: any): AsyncJob {
    return {
      id: row.id,
      sessionId: row.session_id,
      status: row.status as AsyncJob['status'],
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error || undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
    };
  }

  return {
    create(jobId: string, sessionId: string): AsyncJob {
      const startedAt = Date.now();
      db.execute(
        'INSERT INTO async_jobs (id, session_id, status, started_at) VALUES (?, ?, ?, ?)',
        [jobId, sessionId, 'processing', startedAt]
      );
      return { id: jobId, sessionId, status: 'processing', startedAt };
    },

    get(jobId: string): AsyncJob | undefined {
      const row = db.queryOne<any>('SELECT * FROM async_jobs WHERE id = ?', [jobId]);
      return row ? rowToJob(row) : undefined;
    },

    update(jobId: string, updates: Partial<Omit<AsyncJob, 'id' | 'sessionId' | 'startedAt'>>): boolean {
      const existing = this.get(jobId);
      if (!existing) return false;

      const fields: string[] = [];
      const params: any[] = [];

      if (updates.status) {
        fields.push('status = ?');
        params.push(updates.status);
      }
      if (updates.result !== undefined) {
        fields.push('result = ?');
        params.push(JSON.stringify(updates.result));
      }
      if (updates.error !== undefined) {
        fields.push('error = ?');
        params.push(updates.error);
      }
      if (updates.completedAt) {
        fields.push('completed_at = ?');
        params.push(updates.completedAt);
      }

      if (fields.length === 0) return true;

      params.push(jobId);
      db.execute(`UPDATE async_jobs SET ${fields.join(', ')} WHERE id = ?`, params);
      return true;
    },

    delete(jobId: string): boolean {
      db.execute('DELETE FROM async_jobs WHERE id = ?', [jobId]);
      return true;
    },

    cleanup(maxAgeMs: number): number {
      const cutoff = Date.now() - maxAgeMs;
      const result = db.execute('DELETE FROM async_jobs WHERE started_at < ?', [cutoff]);
      if (result.changes > 0) {
        log.info('JobStore', `Cleaned up ${result.changes} expired async jobs`);
      }
      return result.changes;
    },

    failAllProcessingJobs(error: string): number {
      const result = db.execute(
        'UPDATE async_jobs SET status = ?, error = ?, completed_at = ? WHERE status = ?',
        ['failed', error, Date.now(), 'processing']
      );
      if (result.changes > 0) {
        log.info('JobStore', `Marked ${result.changes} abandoned jobs as failed`);
      }
      return result.changes;
    }
  };
}
