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

/**
 * Initialize the capability logger with a database connection.
 * Called once at server startup.
 */
export function initCapabilityLog(connection: DatabaseConnection): void {
  db = connection;
  // Ensure table exists even if migration 002 wasn't applied
  try {
    db.execute(`
      CREATE TABLE IF NOT EXISTS capability_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        module_name TEXT,
        triage_verdict TEXT,
        triage_reason TEXT,
        test_passed INTEGER,
        test_details TEXT,
        request TEXT,
        session_id TEXT,
        source TEXT DEFAULT 'web',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `, []);
  } catch (err: any) {
    log.warn('CapabilityLog', `Failed to ensure table: ${err.message}`);
  }
}

/**
 * Log a capability mutation event.
 */
export function logCapability(entry: {
  action: CapabilityAction;
  moduleName?: string;
  triageVerdict?: string;
  triageReason?: string;
  testPassed?: boolean;
  testDetails?: string;
  request?: string;
  sessionId?: string;
  source?: string;
}): void {
  if (!db) {
    log.warn('CapabilityLog', 'Database not initialized — skipping log');
    return;
  }

  try {
    db.execute(
      `INSERT INTO capability_log (action, module_name, triage_verdict, triage_reason, test_passed, test_details, request, session_id, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.action,
        entry.moduleName || null,
        entry.triageVerdict || null,
        entry.triageReason || null,
        entry.testPassed !== undefined ? (entry.testPassed ? 1 : 0) : null,
        entry.testDetails || null,
        entry.request || null,
        entry.sessionId || null,
        entry.source || 'web',
      ],
    );
    log.info('CapabilityLog', `Logged: ${entry.action} ${entry.moduleName || ''} ${entry.triageVerdict || ''}`);
  } catch (err: any) {
    log.error('CapabilityLog', `Failed to log: ${err.message}`);
  }
}

/**
 * Get recent capability log entries.
 */
export function getCapabilityLog(limit: number = 50): CapabilityLogEntry[] {
  if (!db) return [];

  try {
    return db.query<CapabilityLogEntry>(
      `SELECT id, action, module_name as moduleName, triage_verdict as triageVerdict,
              triage_reason as triageReason, test_passed as testPassed,
              test_details as testDetails, request, session_id as sessionId,
              source, created_at as createdAt
       FROM capability_log ORDER BY id DESC LIMIT ?`,
      [limit],
    );
  } catch {
    return [];
  }
}
