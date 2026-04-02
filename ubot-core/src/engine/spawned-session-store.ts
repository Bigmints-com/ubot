/**
 * Spawned Session Store
 *
 * Persistence for sub-agent sessions spawned via sessions_spawn tool.
 */

import { log } from '../logger/ring-buffer.js';
import type { DatabaseConnection } from '../data/database/types.js';

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

export interface SpawnedSessionStore {
  create(session: Omit<SpawnedSession, 'endTime' | 'result' | 'error'>): Promise<SpawnedSession>;
  get(id: string): Promise<SpawnedSession | undefined>;
  list(): Promise<SpawnedSession[]>;
  update(id: string, updates: Partial<Pick<SpawnedSession, 'status' | 'result' | 'error' | 'endTime'>>): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  failAllRunningSessions(error: string): Promise<number>;
}

export function createSpawnedSessionStore(db: DatabaseConnection): SpawnedSessionStore {
  const getClient = () => db.get_client();

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
    async create(session: Omit<SpawnedSession, 'endTime' | 'result' | 'error'>): Promise<SpawnedSession> {
      await getClient().from('ubot_spawned_sessions').insert({
        id: session.id,
        task: session.task,
        agent_id: session.agentId,
        status: session.status,
        start_time: session.startTime,
        depth: session.depth
      });
      return { ...session, endTime: null, result: null, error: null };
    },

    async get(id: string): Promise<SpawnedSession | undefined> {
      const { data, error } = await getClient()
        .from('ubot_spawned_sessions')
        .select('*')
        .eq('id', id)
        .single();
      return data && !error ? rowToSession(data) : undefined;
    },

    async list(): Promise<SpawnedSession[]> {
      const { data, error } = await getClient()
        .from('ubot_spawned_sessions')
        .select('*')
        .order('start_time', { ascending: false });
      return data && !error ? data.map(rowToSession) : [];
    },

    async update(id: string, updates: Partial<Pick<SpawnedSession, 'status' | 'result' | 'error' | 'endTime'>>): Promise<boolean> {
      const fields: any = {};
      if (updates.status) fields.status = updates.status;
      if (updates.result !== undefined) fields.result = updates.result;
      if (updates.error !== undefined) fields.error = updates.error;
      if (updates.endTime !== undefined) fields.end_time = updates.endTime;

      if (Object.keys(fields).length === 0) return true;

      const { error } = await getClient()
        .from('ubot_spawned_sessions')
        .update(fields)
        .eq('id', id);
      return !error;
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await getClient().from('ubot_spawned_sessions').delete().eq('id', id);
      return !error;
    },

    async failAllRunningSessions(errorMessage: string): Promise<number> {
      const { data, error } = await getClient()
        .from('ubot_spawned_sessions')
        .update({ status: 'failed', error: errorMessage, end_time: Date.now() })
        .eq('status', 'running')
        .select('id');
        
      if (error) return 0;
      const count = data ? data.length : 0;
      
      if (count > 0) {
        log.info('SpawnedSessionStore', `Marked ${count} abandoned sub-agents as failed`);
      }
      return count;
    },
  };
}
