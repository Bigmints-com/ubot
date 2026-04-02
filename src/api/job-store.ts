/**
 * Async Job Store
 *
 * Persistence for long-running chat jobs.
 * Used by the async API to track progress across restarts.
 */

import { log } from '../logger/ring-buffer.js';
import type { DatabaseConnection } from '../data/database/types.js';

export interface AsyncJob {
  id: string;
  sessionId: string;
  status: 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface AsyncJobStore {
  create(jobId: string, sessionId: string): Promise<AsyncJob>;
  get(jobId: string): Promise<AsyncJob | undefined>;
  update(jobId: string, updates: Partial<Omit<AsyncJob, 'id' | 'sessionId' | 'startedAt'>>): Promise<boolean>;
  delete(jobId: string): Promise<boolean>;
  cleanup(maxAgeMs: number): Promise<number>;
  failAllProcessingJobs(error: string): Promise<number>;
}

export function createAsyncJobStore(db: DatabaseConnection): AsyncJobStore {
  const getClient = () => db.get_client();

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
    async create(jobId: string, sessionId: string): Promise<AsyncJob> {
      const startedAt = Date.now();
      await getClient().from('ubot_async_jobs').insert({
        id: jobId,
        session_id: sessionId,
        status: 'processing',
        started_at: startedAt
      });
      return { id: jobId, sessionId, status: 'processing', startedAt };
    },

    async get(jobId: string): Promise<AsyncJob | undefined> {
      const { data, error } = await getClient().from('ubot_async_jobs').select('*').eq('id', jobId).single();
      return data && !error ? rowToJob(data) : undefined;
    },

    async update(jobId: string, updates: Partial<Omit<AsyncJob, 'id' | 'sessionId' | 'startedAt'>>): Promise<boolean> {
      const existing = await this.get(jobId);
      if (!existing) return false;

      const fields: any = {};
      if (updates.status) fields.status = updates.status;
      if (updates.result !== undefined) fields.result = JSON.stringify(updates.result);
      if (updates.error !== undefined) fields.error = updates.error;
      if (updates.completedAt) fields.completed_at = updates.completedAt;

      if (Object.keys(fields).length === 0) return true;

      const { error } = await getClient().from('ubot_async_jobs').update(fields).eq('id', jobId);
      return !error;
    },

    async delete(jobId: string): Promise<boolean> {
      const { error } = await getClient().from('ubot_async_jobs').delete().eq('id', jobId);
      return !error;
    },

    async cleanup(maxAgeMs: number): Promise<number> {
      const cutoff = Date.now() - maxAgeMs;
      const { data, error } = await getClient()
        .from('ubot_async_jobs')
        .delete()
        .lt('started_at', cutoff)
        .select('id');
        
      if (error) return 0;
      const count = data ? data.length : 0;
      if (count > 0) {
        log.info('JobStore', `Cleaned up ${count} expired async jobs`);
      }
      return count;
    },

    async failAllProcessingJobs(errorMessage: string): Promise<number> {
      const { data, error } = await getClient()
        .from('ubot_async_jobs')
        .update({ status: 'failed', error: errorMessage, completed_at: Date.now() })
        .eq('status', 'processing')
        .select('id');
        
      if (error) return 0;
      const count = data ? data.length : 0;
      if (count > 0) {
        log.info('JobStore', `Marked ${count} abandoned jobs as failed`);
      }
      return count;
    }
  };
}
