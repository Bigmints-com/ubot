/**
 * Capability Audit Log
 * 
 * Persistent log of autonomous capability mutations:
 * triage decisions, module builds, tests, promotions, deletions.
 * 
 * Stored in SQLite for auditability.
 */

import type { DatabaseConnection } from '../../data/database/types.js';
import { log } from '../../logger/ring-buffer.js';

export type CapabilityAction = 'triage' | 'build' | 'test' | 'promote' | 'delete' | 'hot_reload';

export interface CapabilityLogEntry {
  id: number;
  action: CapabilityAction;
  moduleName: string | null;
  triageVerdict: string | null;
  triageReason: string | null;
  testPassed: boolean | null;
  testDetails: string | null;
  request: string | null;
  sessionId: string | null;
  source: string;
  createdAt: string;
}

let db: DatabaseConnection | null = null;

export function initCapabilityLog(connection: DatabaseConnection): void {
  db = connection;
}

/**
 * Log a capability mutation event.
 */
export async function logCapability(entry: {
  action: CapabilityAction;
  moduleName?: string;
  triageVerdict?: string;
  triageReason?: string;
  testPassed?: boolean;
  testDetails?: string;
  request?: string;
  sessionId?: string;
  source?: string;
}): Promise<void> {
  if (!db) {
    log.warn('CapabilityLog', 'Database not initialized — skipping log');
    return;
  }

  try {
    await db.get_client().from('ubot_capability_log').insert({
      action: entry.action,
      module_name: entry.moduleName || null,
      triage_verdict: entry.triageVerdict || null,
      triage_reason: entry.triageReason || null,
      test_passed: entry.testPassed !== undefined ? (entry.testPassed ? 1 : 0) : null,
      test_details: entry.testDetails || null,
      request: entry.request || null,
      session_id: entry.sessionId || null,
      source: entry.source || 'web'
    });
    log.info('CapabilityLog', `Logged: ${entry.action} ${entry.moduleName || ''} ${entry.triageVerdict || ''}`);
  } catch (err: any) {
    log.error('CapabilityLog', `Failed to log: ${err.message}`);
  }
}

/**
 * Get recent capability log entries.
 */
export async function getCapabilityLog(limit: number = 50): Promise<CapabilityLogEntry[]> {
  if (!db) return [];

  try {
    const { data, error } = await db.get_client()
      .from('ubot_capability_log')
      .select('*')
      .order('id', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    
    return data.map((row: any) => ({
      id: row.id,
      action: row.action as CapabilityAction,
      moduleName: row.module_name,
      triageVerdict: row.triage_verdict,
      triageReason: row.triage_reason,
      testPassed: row.test_passed === 1,
      testDetails: row.test_details,
      request: row.request,
      sessionId: row.session_id,
      source: row.source,
      createdAt: row.created_at
    }));
  } catch {
    return [];
  }
}
